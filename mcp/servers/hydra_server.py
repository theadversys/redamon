"""
Hydra MCP Server - Credential Cracker

Exposes hydra as MCP tool for agentic penetration testing.
Output goes to stdout; use ingest_hydra_output to ingest cracked credentials.

Tools:
    - execute_hydra: Execute hydra with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "hydra"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("HYDRA_PORT", "8009"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_hydra(args: str) -> str:
    """
    Execute hydra credential cracker with any valid CLI arguments.

    After running, use ingest_hydra_output (PandaExploit MCP) to ingest
    cracked credentials into the graph.

    Args:
        args: Command-line arguments for hydra (without the 'hydra' command itself)

    Returns:
        Command output (stdout + stderr combined). Pass raw_output to ingest_hydra_output.

    Examples:
        SSH brute force:
        - "-l root -P /usr/share/wordlists/rockyou.txt ssh://192.168.1.1"

        HTTP form login:
        - "-l admin -P passwords.txt 192.168.1.1 http-post-form '/login:username=^USER^&password=^PASS^:F=incorrect'"

        FTP:
        - "-L users.txt -P pass.txt ftp://target.com"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["hydra"] + cmd_args,
            capture_output=True,
            text=True,
            timeout=1800,
        )
        output = ANSI_ESCAPE.sub("", result.stdout)
        if result.stderr:
            clean_stderr = ANSI_ESCAPE.sub("", result.stderr)
            if clean_stderr.strip():
                output += f"\n[STDERR]: {clean_stderr}"
        return output if output.strip() else "[INFO] No results (check target and args)"
    except subprocess.TimeoutExpired:
        return "[ERROR] Command timed out after 1800 seconds. Consider a smaller wordlist."
    except FileNotFoundError:
        return "[ERROR] hydra not found. Ensure it is installed (apt install hydra) and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
