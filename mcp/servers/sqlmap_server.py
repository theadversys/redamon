"""
Sqlmap MCP Server - SQL Injection Scanner

Exposes sqlmap as MCP tools for agentic penetration testing.
Uses dynamic CLI wrapper approach for maximum flexibility.

Tools:
    - execute_sqlmap: Execute sqlmap with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "sqlmap"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SQLMAP_PORT", "8005"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_sqlmap(args: str) -> str:
    """
    Execute sqlmap SQL injection scanner with any valid CLI arguments.

    Sqlmap detects and exploits SQL injection vulnerabilities.
    Use --batch for non-interactive mode. Pass the output to
    ingest_sqlmap_output to add findings to the graph.

    Args:
        args: Command-line arguments for sqlmap (without the 'sqlmap' command itself)

    Returns:
        Command output (stdout + stderr combined)

    Examples:
        Basic scan (non-interactive):
        - "-u \"http://target.com/page?id=1\" --batch"

        Scan with specific parameter:
        - "-u \"http://target.com/search\" --data=\"q=test\" --batch"

        From request file:
        - "-r request.txt --batch"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["sqlmap"] + cmd_args,
            capture_output=True,
            text=True,
            timeout=900,
        )
        output = ANSI_ESCAPE.sub('', result.stdout)
        if result.stderr:
            clean_stderr = ANSI_ESCAPE.sub('', result.stderr)
            stderr_lines = [
                line for line in clean_stderr.split('\n')
                if line.strip()
            ]
            if stderr_lines:
                output += f"\n[STDERR]: {chr(10).join(stderr_lines)}"
        return output if output.strip() else "[INFO] No injection found"
    except subprocess.TimeoutExpired:
        return "[ERROR] Command timed out after 900 seconds."
    except FileNotFoundError:
        return "[ERROR] sqlmap not found. Ensure it is installed and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
