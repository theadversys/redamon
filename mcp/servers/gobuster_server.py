"""
Gobuster MCP Server - Directory/DNS Fuzzer

Exposes gobuster as MCP tool for agentic penetration testing.
Outputs to stdout for ingest_custom_findings.

Tools:
    - execute_gobuster: Execute gobuster with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "gobuster"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("GOBUSTER_PORT", "8008"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_gobuster(args: str) -> str:
    """
    Execute gobuster directory/DNS/vhost fuzzer with any valid CLI arguments.

    For directory mode, output goes to stdout. Use ingest_custom_findings to
    ingest results into the graph.

    Args:
        args: Command-line arguments for gobuster (without the 'gobuster' command itself)

    Returns:
        Command output (stdout + stderr combined).

    Examples:
        Directory brute force:
        - "dir -u https://example.com/ -w /usr/share/wordlists/dirb/common.txt"

        DNS subdomain enumeration:
        - "dns -d example.com -w /usr/share/wordlists/dirb/common.txt"

        Vhost discovery:
        - "vhost -u https://example.com -w vhosts.txt"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["gobuster"] + cmd_args,
            capture_output=True,
            text=True,
            timeout=600,
        )
        output = ANSI_ESCAPE.sub("", result.stdout)
        if result.stderr:
            clean_stderr = ANSI_ESCAPE.sub("", result.stderr)
            if clean_stderr.strip():
                output += f"\n[STDERR]: {clean_stderr}"
        return output if output.strip() else "[INFO] No results (check target and args)"
    except subprocess.TimeoutExpired:
        return "[ERROR] Command timed out after 600 seconds. Consider a smaller scope."
    except FileNotFoundError:
        return "[ERROR] gobuster not found. Ensure it is installed (apt install gobuster) and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
