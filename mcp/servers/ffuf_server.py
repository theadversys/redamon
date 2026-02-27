"""
Ffuf MCP Server - Web Fuzzer

Exposes ffuf as MCP tool for agentic penetration testing.
Use -o - -of json for JSON output suitable for ingest_custom_findings.

Tools:
    - execute_ffuf: Execute ffuf with any CLI arguments
"""

from fastmcp import FastMCP
import subprocess
import shlex
import re
import os

# Strip ANSI escape codes (terminal colors) from output
ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

# Server configuration
SERVER_NAME = "ffuf"
SERVER_HOST = os.getenv("MCP_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("FFUF_PORT", "8007"))

mcp = FastMCP(SERVER_NAME)


@mcp.tool()
def execute_ffuf(args: str) -> str:
    """
    Execute ffuf web fuzzer with any valid CLI arguments.

    For ingest, use -o - -of json to output JSON to stdout. Example:
    ffuf -u https://example.com/FUZZ -w wordlist.txt -o - -of json

    Args:
        args: Command-line arguments for ffuf (without the 'ffuf' command itself)

    Returns:
        Command output (stdout + stderr combined). Use -o - -of json for ingest.

    Examples:
        Directory fuzzing with JSON output:
        - "-u https://example.com/FUZZ -w /usr/share/wordlists/dirb/common.txt -o - -of json"

        Parameter fuzzing:
        - "-u https://example.com/?id=FUZZ -w params.txt -o - -of json"
    """
    try:
        cmd_args = shlex.split(args)
        result = subprocess.run(
            ["ffuf"] + cmd_args,
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
        return "[ERROR] ffuf not found. Ensure it is installed (apt install ffuf) and in PATH."
    except Exception as e:
        return f"[ERROR] {str(e)}"


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        mcp.run(transport="sse", host=SERVER_HOST, port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
