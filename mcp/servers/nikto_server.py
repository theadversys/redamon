"""
Nikto MCP Server - Web Server Scanner

Exposes nikto web server scanner as MCP tools for agentic penetration testing.
Uses dynamic CLI wrapper approach for maximum flexibility.

Tools:
    - execute_nikto: Execute nikto with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "nikto"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("NIKTO_PORT", "8004"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_nikto(args: str) -> str:
    """
    Execute nikto web server scanner with any valid CLI arguments.

    Nikto scans web servers for dangerous files, outdated software, and
    other vulnerabilities. Use -Format json for parseable output that
    can be ingested into the graph.

    Args:
        args: Command-line arguments for nikto (without the 'nikto' command itself)

    Returns:
        Command output (stdout + stderr combined)

    Examples:
        Basic scan with JSON output:
        - "-h example.com -Format json"

        Scan specific port:
        - "-h example.com -p 80,443 -Format json"

        Scan with SSL:
        - "-h example.com -ssl -Format json"

        Output to stdout (use -output - with -Format json):
        - "-h example.com -output - -Format json"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["nikto"] + cmd_args,
            capture_output=True,
            text=True,
            timeout=600,
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
        return output if output.strip() else "[INFO] No findings"
    except subprocess.TimeoutExpired:
        return "[ERROR] Command timed out after 600 seconds."
    except FileNotFoundError:
        return "[ERROR] nikto not found. Ensure it is installed and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
