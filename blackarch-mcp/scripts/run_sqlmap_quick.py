#!/usr/bin/env python3
"""Quick sqlmap test via BlackArch MCP - --version first, then short scan."""
import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(REPO_ROOT))

URL = os.environ.get("BLACKARCH_MCP_URL", "http://127.0.0.1:8080/sse")


async def call_tool(session, tool_name: str, arguments: str):
    from mcp.types import TextContent
    result = await session.call_tool(
        "run_security_tool",
        arguments={"tool_name": tool_name, "arguments": arguments},
        read_timeout_seconds=timedelta(seconds=120),
    )
    out = ""
    for c in result.content:
        if hasattr(c, "text"):
            out = c.text
            break
    return out


async def main():
    try:
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
    except ImportError:
        print("Install: pip install mcp httpx-sse")
        return 1

    print(f"Connecting to {URL}...")
    async with sse_client(URL, timeout=15.0, sse_read_timeout=120.0) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            print("Connected.\n")

            print("1. sqlmap --version:")
            out = await call_tool(session, "sqlmap", "--version")
            print(out[:1500] if len(out) > 1500 else out)
            print()

            print("2. sqlmap quick test (--batch, --threads=1, --time-sec=3):")
            out = await call_tool(
                session,
                "sqlmap",
                '-u "http://testasp.vulnweb.com/showforum.asp?id=0" --batch --threads=1 --time-sec=3 --level=1 --risk=1',
            )
            print(out[:3000] if len(out) > 3000 else out)

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
