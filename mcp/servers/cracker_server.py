"""
Password Cracking MCP Server — hashcat and john the ripper

Auto-detects hash type and routes to the best cracker.

Tools:
    crack_hash        : Auto-detect hash type and crack with hashcat then john fallback
    identify_hash     : Identify hash type without cracking
    crack_batch       : Crack multiple hashes from a file
    list_wordlists    : List available wordlists on the system
    check_hash_cracked: Check if a hash was already cracked in hashcat's potfile
"""

import os
import re
import json
import subprocess
import logging
from pathlib import Path
from typing import Optional
from fastmcp import FastMCP

logger = logging.getLogger(__name__)

SERVER_NAME = "password-crack"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("CRACKER_PORT", "8018"))

DEFAULT_WORDLIST = os.getenv("DEFAULT_WORDLIST", "/usr/share/wordlists/rockyou.txt")
HASHCAT_POTFILE = os.path.expanduser("~/.hashcat/hashcat.potfile")
OUTPUT_DIR = "/opt/output/cracked"

mcp = FastMCP(SERVER_NAME)

# Hash pattern → hashcat mode mappings (covers 90%+ of pentest hashes)
HASH_PATTERNS = [
    # NT hashes (Windows SAM/NTDS)
    (r"^[a-fA-F0-9]{32}$", 1000, "NTLM"),
    # NTLMv2 challenge-response (Responder capture format: user::domain:...)
    (r"^[^:]+::[^:]+:[a-fA-F0-9]{16}:[a-fA-F0-9]{32}:[a-fA-F0-9]+$", 5600, "NTLMv2"),
    # NTLMv1
    (r"^[^:]+::[^:]+:[a-fA-F0-9]{48}:[a-fA-F0-9]{48}:[a-fA-F0-9]{16}$", 5500, "NTLMv1"),
    # MD5
    (r"^[a-fA-F0-9]{32}$", 0, "MD5"),
    # SHA-1
    (r"^[a-fA-F0-9]{40}$", 100, "SHA-1"),
    # SHA-256
    (r"^[a-fA-F0-9]{64}$", 1400, "SHA-256"),
    # SHA-512
    (r"^[a-fA-F0-9]{128}$", 1700, "SHA-512"),
    # bcrypt
    (r"^\$2[aby]\$.{56}$", 3200, "bcrypt"),
    # SHA-512crypt (Linux /etc/shadow)
    (r"^\$6\$.+\$.+$", 1800, "sha512crypt"),
    # SHA-256crypt
    (r"^\$5\$.+\$.+$", 7400, "sha256crypt"),
    # MD5crypt
    (r"^\$1\$.+\$.+$", 500, "md5crypt"),
    # Kerberos 5 TGS-REP (Kerberoasting)
    (r"^\$krb5tgs\$", 13100, "Kerberos5-TGS-RC4"),
    # Kerberos 5 AS-REP (AS-REProasting)
    (r"^\$krb5asrep\$", 18200, "Kerberos5-AS-REP"),
    # LM hash
    (r"^[a-fA-F0-9]{32}:[a-fA-F0-9]{32}$", 3000, "LM"),
    # Net-MD5
    (r"^[a-fA-F0-9]{32}:[a-fA-F0-9]{32}:[a-fA-F0-9]{32}$", 7300, "IPMI2-RAKP-HMAC-SHA1"),
]

# john format mappings
JOHN_FORMATS = {
    "NTLM": "nt",
    "NTLMv2": "netntlmv2",
    "NTLMv1": "netntlmv1",
    "MD5": "raw-md5",
    "SHA-1": "raw-sha1",
    "SHA-256": "raw-sha256",
    "SHA-512": "raw-sha512",
    "bcrypt": "bcrypt",
    "sha512crypt": "sha512crypt",
    "sha256crypt": "sha256crypt",
    "md5crypt": "md5crypt",
    "Kerberos5-TGS-RC4": "krb5tgs",
    "Kerberos5-AS-REP": "krb5asrep",
    "LM": "lm",
}


def _detect_hash_type(hash_val: str) -> tuple[int, str]:
    """Return (hashcat_mode, type_name) for the given hash. Defaults to (0, 'Unknown')."""
    h = hash_val.strip()
    for pattern, mode, name in HASH_PATTERNS:
        if re.match(pattern, h):
            return mode, name
    # Default to NTLM detection if 32 hex chars (most common in AD pentests)
    if re.match(r"^[a-fA-F0-9]{32}$", h):
        return 1000, "NTLM"
    return 0, "Unknown"


def _crack_with_hashcat(hash_val: str, mode: int, wordlist: str, rules: Optional[str]) -> dict:
    """Run hashcat and return result dict."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    hash_file = f"{OUTPUT_DIR}/hashcat_input.txt"
    with open(hash_file, "w") as f:
        f.write(hash_val.strip() + "\n")

    cmd = [
        "hashcat", "-m", str(mode), hash_file, wordlist,
        "--potfile-path", HASHCAT_POTFILE,
        "--status", "--status-timer", "5",
        "-O",  # optimized kernel
        "--force",  # ignore GPU warnings (container environment)
        "-q",  # quiet
    ]
    if rules:
        cmd += ["-r", rules]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        output = result.stdout + result.stderr
        # Check potfile for cracked hash
        cracked = _check_potfile(hash_val)
        return {
            "tool": "hashcat",
            "success": cracked is not None,
            "cracked_password": cracked,
            "output": output[-3000:],
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"tool": "hashcat", "success": False, "error": "hashcat not found"}
    except subprocess.TimeoutExpired:
        return {"tool": "hashcat", "success": False, "error": "hashcat timed out (300s)"}


def _crack_with_john(hash_val: str, hash_type: str, wordlist: str) -> dict:
    """Run John the Ripper as fallback."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    hash_file = f"{OUTPUT_DIR}/john_input.txt"
    with open(hash_file, "w") as f:
        f.write(hash_val.strip() + "\n")

    john_format = JOHN_FORMATS.get(hash_type, "")
    cmd = ["john", hash_file, f"--wordlist={wordlist}"]
    if john_format:
        cmd += [f"--format={john_format}"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        # Show cracked
        show_result = subprocess.run(
            ["john", "--show", hash_file] + ([f"--format={john_format}"] if john_format else []),
            capture_output=True, text=True, timeout=10,
        )
        output = result.stdout + result.stderr
        cracked_output = show_result.stdout.strip()
        cracked_password = None
        if cracked_output and ":" in cracked_output:
            lines = [l for l in cracked_output.splitlines() if ":" in l and not l.startswith("0 ")]
            if lines:
                cracked_password = lines[0].split(":", 1)[-1] if lines else None

        return {
            "tool": "john",
            "success": cracked_password is not None,
            "cracked_password": cracked_password,
            "john_show_output": cracked_output,
            "output": output[-2000:],
        }
    except FileNotFoundError:
        return {"tool": "john", "success": False, "error": "john not found"}
    except subprocess.TimeoutExpired:
        return {"tool": "john", "success": False, "error": "john timed out (300s)"}


def _check_potfile(hash_val: str) -> Optional[str]:
    """Check hashcat potfile for already-cracked hash. Returns plaintext or None."""
    if not os.path.exists(HASHCAT_POTFILE):
        return None
    h = hash_val.strip().lower()
    try:
        with open(HASHCAT_POTFILE) as f:
            for line in f:
                if ":" in line:
                    parts = line.strip().split(":", 1)
                    if parts[0].lower() == h or h in line.lower():
                        return parts[1] if len(parts) > 1 else None
    except Exception:
        pass
    return None


@mcp.tool()
def crack_hash(
    hash_value: str,
    wordlist: Optional[str] = None,
    hash_type_hint: Optional[str] = None,
    use_rules: bool = True,
    timeout_seconds: int = 300,
) -> str:
    """
    Auto-detect hash type and crack it using hashcat (GPU) with john fallback.

    Supports: NTLM, NTLMv2, NTLMv1, MD5, SHA-1, SHA-256, SHA-512, bcrypt,
    sha512crypt (Linux shadow), Kerberos TGS (kerberoasting), LM, and more.

    Args:
        hash_value: The hash to crack (single hash string)
        wordlist: Path to wordlist (default: /usr/share/wordlists/rockyou.txt)
        hash_type_hint: Override auto-detection (e.g. 'NTLM', 'NTLMv2', 'bcrypt')
        use_rules: Apply hashcat best64 rules for mutation (default True)
        timeout_seconds: Max time to spend cracking (default 300s)

    Returns:
        JSON with cracked_password (if found), hash_type, tool used, and output.
    """
    wl = wordlist or DEFAULT_WORDLIST
    if not os.path.exists(wl):
        # Fallback: try to find any wordlist
        for candidate in ["/usr/share/wordlists/rockyou.txt", "/usr/share/wordlists/fasttrack.txt"]:
            if os.path.exists(candidate):
                wl = candidate
                break

    # Check potfile first (instant)
    already_cracked = _check_potfile(hash_value)
    if already_cracked:
        return json.dumps({
            "success": True,
            "cracked_password": already_cracked,
            "source": "potfile_cache",
            "hash_value": hash_value,
        })

    mode, detected_type = _detect_hash_type(hash_value)
    if hash_type_hint:
        for _, m, n in HASH_PATTERNS:
            if n.lower() == hash_type_hint.lower():
                mode, detected_type = m, n
                break

    rules = "/usr/share/hashcat/rules/best64.rule" if use_rules else None

    # Try hashcat first
    hc_result = _crack_with_hashcat(hash_value, mode, wl, rules)
    if hc_result.get("success"):
        return json.dumps({
            "success": True,
            "cracked_password": hc_result["cracked_password"],
            "tool": "hashcat",
            "hash_type": detected_type,
            "hash_mode": mode,
            "hash_value": hash_value,
        })

    # Fallback to john
    john_result = _crack_with_john(hash_value, detected_type, wl)
    if john_result.get("success"):
        return json.dumps({
            "success": True,
            "cracked_password": john_result["cracked_password"],
            "tool": "john",
            "hash_type": detected_type,
            "hash_value": hash_value,
        })

    # Not cracked
    return json.dumps({
        "success": False,
        "cracked_password": None,
        "hash_type": detected_type,
        "hash_mode": mode,
        "hash_value": hash_value,
        "hashcat_output": hc_result.get("output", "")[-500:],
        "john_output": john_result.get("output", "")[-500:],
        "suggestions": [
            f"Try a larger wordlist (current: {wl})",
            f"Try: hashcat -m {mode} hash.txt /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/rockyou-30000.rule",
            "Try mask attack: hashcat -m {mode} hash.txt -a 3 ?u?l?l?l?l?d?d",
        ],
    })


@mcp.tool()
def identify_hash(hash_value: str) -> str:
    """
    Identify the type of a hash without attempting to crack it.

    Args:
        hash_value: The hash string to identify

    Returns:
        JSON with detected type, hashcat mode, and john format.
    """
    mode, name = _detect_hash_type(hash_value)
    john_fmt = JOHN_FORMATS.get(name, "unknown")

    # Also run hashid if available
    hashid_output = ""
    try:
        r = subprocess.run(["hashid", hash_value], capture_output=True, text=True, timeout=5)
        hashid_output = r.stdout.strip()
    except FileNotFoundError:
        hashid_output = "hashid not installed"

    return json.dumps({
        "hash_value": hash_value[:20] + "...",
        "detected_type": name,
        "hashcat_mode": mode,
        "john_format": john_fmt,
        "hashid_output": hashid_output,
    })


@mcp.tool()
def crack_batch(
    hashes_file_path: str,
    hash_mode: Optional[int] = None,
    wordlist: Optional[str] = None,
    use_rules: bool = True,
) -> str:
    """
    Crack a file containing multiple hashes at once using hashcat.

    More efficient than cracking one at a time — hashcat processes batches fast.

    Args:
        hashes_file_path: Path to file with one hash per line
        hash_mode: Hashcat mode (auto-detect from first hash if omitted)
        wordlist: Path to wordlist (default: rockyou.txt)
        use_rules: Apply best64 rules (default True)

    Returns:
        JSON with cracked counts and any recovered passwords.
    """
    if not os.path.exists(hashes_file_path):
        return json.dumps({"success": False, "error": f"File not found: {hashes_file_path}"})

    wl = wordlist or DEFAULT_WORDLIST
    if not os.path.exists(wl):
        return json.dumps({"success": False, "error": f"Wordlist not found: {wl}"})

    if hash_mode is None:
        with open(hashes_file_path) as f:
            first_line = f.readline().strip()
        hash_mode, _ = _detect_hash_type(first_line)

    cmd = [
        "hashcat", "-m", str(hash_mode), hashes_file_path, wl,
        "--potfile-path", HASHCAT_POTFILE,
        "--force", "-q", "-O",
    ]
    if use_rules:
        cmd += ["-r", "/usr/share/hashcat/rules/best64.rule"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        # Show cracked
        show_cmd = ["hashcat", "-m", str(hash_mode), hashes_file_path, "--show",
                    "--potfile-path", HASHCAT_POTFILE]
        show_result = subprocess.run(show_cmd, capture_output=True, text=True, timeout=15)
        cracked_lines = [l.strip() for l in show_result.stdout.splitlines() if l.strip()]
        return json.dumps({
            "success": True,
            "cracked_count": len(cracked_lines),
            "cracked": cracked_lines[:50],
            "hash_mode": hash_mode,
            "output": result.stdout[-1000:],
        })
    except subprocess.TimeoutExpired:
        return json.dumps({"success": False, "error": "Batch cracking timed out (600s)"})
    except FileNotFoundError:
        return json.dumps({"success": False, "error": "hashcat not found"})


@mcp.tool()
def list_wordlists() -> str:
    """
    List available wordlists on the system.

    Returns known wordlist paths and their sizes.
    """
    candidates = [
        "/usr/share/wordlists/rockyou.txt",
        "/usr/share/wordlists/fasttrack.txt",
        "/usr/share/wordlists/dirb/common.txt",
        "/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt.tar.gz",
        "/usr/share/wordlists/metasploit/password.lst",
        "/opt/wordlists/",
    ]
    results = []
    for path in candidates:
        p = Path(path)
        if p.exists():
            try:
                size = p.stat().st_size if p.is_file() else None
                results.append({
                    "path": path,
                    "exists": True,
                    "size_mb": round(size / 1024 / 1024, 2) if size else None,
                    "is_dir": p.is_dir(),
                })
            except Exception:
                pass
        else:
            results.append({"path": path, "exists": False})

    # Also check gunzip for rockyou
    rockyou_gz = "/usr/share/wordlists/rockyou.txt.gz"
    if os.path.exists(rockyou_gz) and not os.path.exists("/usr/share/wordlists/rockyou.txt"):
        results.append({
            "path": rockyou_gz,
            "exists": True,
            "note": "Run: gunzip /usr/share/wordlists/rockyou.txt.gz to extract",
        })

    return json.dumps({"wordlists": results})


@mcp.tool()
def check_hash_cracked(hash_value: str) -> str:
    """
    Check if a hash has already been cracked and is in hashcat's potfile.

    Args:
        hash_value: Hash to look up

    Returns:
        JSON with found (bool) and cracked_password if found.
    """
    result = _check_potfile(hash_value)
    return json.dumps({
        "found": result is not None,
        "cracked_password": result,
        "hash_value": hash_value[:20] + "..." if len(hash_value) > 20 else hash_value,
    })


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    mcp.run(transport=transport, host=SERVER_HOST, port=SERVER_PORT)
