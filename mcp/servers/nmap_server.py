"""
Nmap MCP Server - Network Scanner

Exposes nmap as MCP tool for agentic penetration testing.
Outputs XML (-oX -) for reliable parsing and ingest into the graph.

Tools:
    - execute_nmap: Execute nmap with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "nmap"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("NMAP_PORT", "8006"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_nmap(args: str) -> str:
    """
    Execute nmap network scanner with any valid CLI arguments.

    Nmap discovers hosts, open ports, and service versions. For graph ingest,
    use -oX - to output XML to stdout. Example:
    nmap -sV -sC -oX - example.com

    Args:
        args: Command-line arguments for nmap (without the 'nmap' command itself)

    Returns:
        Command output (stdout + stderr combined). Use -oX - for XML output suitable for ingest.

    Examples:
        Basic port scan with XML output (for ingest):
        - "-sV -oX - example.com"

        Top ports with service detection:
        - "--top-ports 100 -sV -oX - 192.168.1.1"

        Scan from file:
        - "-iL targets.txt -sV -oX -"

        Quick scan:
        - "-sT -Pn -oX - 10.0.0.0/24"

        Full connect scan with scripts:
        - "-sV -sC -oX - target.com"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["nmap"] + cmd_args,
            capture_output=True,
            text=True,
            timeout=600,
        )
        output = ANSI_ESCAPE.sub("", result.stdout)
        if result.stderr:
            clean_stderr = ANSI_ESCAPE.sub("", result.stderr)
            stderr_lines = [
                line for line in clean_stderr.split("\n")
                if line and not line.startswith("Starting Nmap")
            ]
            if stderr_lines:
                output += f"\n[STDERR]: {chr(10).join(stderr_lines)}"
        return output if output.strip() else "[INFO] No results (check target and args)"
    except subprocess.TimeoutExpired:
        return "[ERROR] Command timed out after 600 seconds. Consider a smaller scope."
    except FileNotFoundError:
        return "[ERROR] nmap not found. Ensure it is installed and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    import sys

    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
