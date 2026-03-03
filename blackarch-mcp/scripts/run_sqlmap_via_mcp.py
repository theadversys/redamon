#!/usr/bin/env python3
"""Run sqlmap via BlackArch MCP - call run_security_tool."""
import asyncio
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(REPO_ROOT))

URL = os.environ.get("BLACKARCH_MCP_URL", "http://127.0.0.1:8080/sse")
TARGET = "http://testasp.vulnweb.com/showforum.asp?id=0"


async def main():
    try:
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
        from mcp.types import TextContent
    except ImportError:
        print("Install: pip install mcp httpx-sse")
        return 1

    print(f"Connecting to {URL}...")
    print(f"Target: {TARGET}")
    print()

    async with sse_client(URL, timeout=15.0, sse_read_timeout=180.0) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            print("Connected. Running sqlmap...")

            result = await session.call_tool(
                "run_security_tool",
                arguments={
                    "tool_name": "sqlmap",
                    "arguments": f'-u "{TARGET}" --batch --level=1 --risk=1',
                },
                read_timeout_seconds=__import__("datetime").timedelta(seconds=180),
            )

            if result.isError:
                print("Error:", result)
                return 1

            for c in result.content:
                if hasattr(c, "text"):
                    print(c.text)
                    break

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
