"""
BlackArch MCP Server - Cybersecurity Oracle

Exposes 2,800+ BlackArch security tools to LLMs via MCP.
Uses disposable Docker containers for isolation.

Tools:
    - run_security_tool: Execute any BlackArch tool with sanitized arguments
Resources:
    - blackarch_catalog: Searchable index of BlackArch tools
"""

import asyncio
import hashlib
import os
import re
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx
from fastmcp import FastMCP

# =============================================================================
# CONFIG
# =============================================================================
BLACKARCH_IMAGE = "blackarchlinux/blackarch"
TOOL_TIMEOUT = int(os.getenv("BLACKARCH_TOOL_TIMEOUT", "1800"))
MAX_OUTPUT_TOKENS = 1024
TOKEN_APPROX = 4  # chars per token
AUDIT_DB_PATH = os.getenv("BLACKARCH_AUDIT_DB", "/var/lib/blackarch-mcp/audit.db")
CATALOG_CACHE_PATH = "/tmp/blackarch_catalog.json"
CATALOG_CACHE_TTL = 86400  # 24h
SANITIZE_PATTERN = re.compile(r"[;&|>`$\n\r]")

# =============================================================================
# SANITIZATION
# =============================================================================


def sanitize_args(args: str) -> str:
    """Strip dangerous chars to prevent command injection."""
    if not args:
        return ""
    return SANITIZE_PATTERN.sub("", args)


def distill_output(output: str, max_chars: int = MAX_OUTPUT_TOKENS * TOKEN_APPROX) -> str:
    """Truncate output if too long."""
    if len(output) <= max_chars:
        return output
    return output[:max_chars] + "\n\n... [truncated]"


# =============================================================================
# TOOL EXECUTION
# =============================================================================


def run_tool_container(tool_name: str, arguments: str, needs_network: bool = False) -> tuple[str, int]:
    """
    Run tool in disposable BlackArch container.
    Returns (stdout+stderr, exit_code).
    """
    safe_args = sanitize_args(arguments)
    network = "none" if not needs_network else "bridge"
    # Tools that need network (see docs/blackarch-offensive-tools-table.md)
    network_tools = {
        "nmap", "nuclei", "curl", "nikto", "sqlmap", "ffuf", "gobuster", "hydra", "naabu",
        "subfinder", "amass", "theharvester", "httpx", "whatweb", "assetfinder", "dnsx",
        "gau", "waybackurls", "recon-ng", "fierce", "masscan", "dirsearch", "feroxbuster",
        "arjun", "commix", "wpscan",
    }
    if tool_name.lower() in network_tools:
        network = "bridge"

    # No --read-only: pacman -S needs writable /var for on-demand install
    cmd = [
        "docker", "run", "--rm",
        "--memory=512m", "--cpus=0.5",
        f"--network={network}",
        BLACKARCH_IMAGE,
        "sh", "-c", f"pacman -S --noconfirm {tool_name} 2>/dev/null; exec {tool_name} {safe_args}"
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TOOL_TIMEOUT,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return distill_output(out), result.returncode
    except subprocess.TimeoutExpired:
        return f"[ERROR] Tool timed out after {TOOL_TIMEOUT}s", -1
    except FileNotFoundError:
        return "[ERROR] Docker not found. Ensure Docker is installed.", -1
    except Exception as e:
        return f"[ERROR] {str(e)}", -1


# =============================================================================
# CATALOG
# =============================================================================


def fetch_blackarch_catalog() -> str:
    """Fetch and cache BlackArch tools from blackarch.org."""
    import json
    if Path(CATALOG_CACHE_PATH).exists():
        mtime = Path(CATALOG_CACHE_PATH).stat().st_mtime
        if time.time() - mtime < CATALOG_CACHE_TTL:
            return Path(CATALOG_CACHE_PATH).read_text()

    try:
        r = httpx.get("https://blackarch.org/tools.html", timeout=30)
        r.raise_for_status()
        html = r.text
        # Extract table rows: Name, Version, Description, Category
        tools = []
        for m in re.finditer(r"<td[^>]*>([^<]+)</td>", html):
            tools.append(m.group(1).strip())
        catalog = []
        for i in range(0, min(len(tools), 1000), 5):
            if i + 3 < len(tools) and tools[i] and not tools[i].startswith("http"):
                catalog.append({
                    "name": tools[i],
                    "version": tools[i + 1] if i + 1 < len(tools) else "",
                    "description": tools[i + 2] if i + 2 < len(tools) else "",
                    "category": tools[i + 3] if i + 3 < len(tools) else "",
                })
        Path(CATALOG_CACHE_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(CATALOG_CACHE_PATH).write_text(json.dumps(catalog, indent=2))
        return json.dumps(catalog[:100], indent=2)
    except Exception as e:
        return json.dumps([{"error": str(e), "fallback": ["nmap", "nuclei", "sqlmap", "nikto", "ffuf"]}])




# =============================================================================
# AUDIT
# =============================================================================


def init_audit_db():
    Path(AUDIT_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AUDIT_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tool_invocations (
            id INTEGER PRIMARY KEY,
            user_id TEXT,
            tool_name TEXT,
            arguments TEXT,
            output_hash TEXT,
            timestamp TEXT
        )
    """)
    conn.commit()
    conn.close()


def log_invocation(user_id: str, tool_name: str, arguments: str, output: str):
    try:
        init_audit_db()
        conn = sqlite3.connect(AUDIT_DB_PATH)
        out_hash = hashlib.sha256(output.encode()).hexdigest()[:16]
        conn.execute(
            "INSERT INTO tool_invocations (user_id, tool_name, arguments, output_hash, timestamp) VALUES (?,?,?,?,?)",
            (user_id or "anonymous", tool_name, arguments[:500], out_hash, time.strftime("%Y-%m-%d %H:%M:%S"))
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# =============================================================================
# BEARER AUTH (Phase 4 - optional)
# =============================================================================
SUBSCRIBER_KEYS = set(k.strip() for k in os.getenv("SUBSCRIBER_KEYS", "").split(",") if k.strip())


def _check_auth(header: Optional[str]) -> bool:
    if not SUBSCRIBER_KEYS:
        return True
    if not header or not header.lower().startswith("bearer "):
        return False
    token = header[7:].strip()
    return token in SUBSCRIBER_KEYS


# =============================================================================
# MCP SERVER
# =============================================================================

mcp = FastMCP("blackarch")


@mcp.tool()
def list_blackarch_tools(query: str = "") -> str:
    """
    Search the BlackArch tool catalog (2,800+ tools).

    Args:
        query: Optional search term to filter tools by name, description, or category.
               Leave empty to return the full catalog (first 100 tools).

    Returns:
        JSON list of tools with name, version, description, category.
    """
    import json
    catalog = json.loads(fetch_blackarch_catalog())
    if isinstance(catalog, list) and catalog and isinstance(catalog[0], dict):
        if query:
            q = query.lower()
            catalog = [
                t for t in catalog
                if q in (t.get("name", "") or "").lower()
                or q in (t.get("description", "") or "").lower()
                or q in (t.get("category", "") or "").lower()
            ]
        return json.dumps(catalog[:100], indent=2)
    return json.dumps(catalog, indent=2)


@mcp.tool()
def verify_tool_available(tool_name: str) -> str:
    """
    Verify a BlackArch tool exists and can be installed (pacman -Si).

    Args:
        tool_name: Name of the tool (e.g., nmap, nuclei, sqlmap)

    Returns:
        Tool info if available, or error message.
    """
    safe_name = sanitize_args(tool_name)
    if not safe_name:
        return "[ERROR] Invalid tool name"
    cmd = [
        "docker", "run", "--rm",
        "--memory=256m", "--cpus=0.25", "--network=none",
        "--read-only", BLACKARCH_IMAGE,
        "sh", "-c", f"pacman -Si {safe_name} 2>&1 || echo '[NOT FOUND]'"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        out = (result.stdout or "") + (result.stderr or "")
        return distill_output(out, 2048)
    except Exception as e:
        return f"[ERROR] {str(e)}"


@mcp.tool(timeout=1810)
def run_security_tool(tool_name: str, arguments: str = "", user_id: Optional[str] = None) -> str:
    """
    Execute a BlackArch security tool in an isolated container.

    Args:
        tool_name: Name of the tool (e.g., nmap, nuclei, sqlmap)
        arguments: CLI arguments (sanitized; no ; & | >)
        user_id: Optional user/subscriber ID for audit

    Returns:
        Tool output (truncated if >1024 tokens)
    """
    output, _ = run_tool_container(tool_name, arguments)
    log_invocation(user_id or "", tool_name, arguments, output)
    return output


@mcp.tool()
def clear_catalog_cache() -> str:
    """
    Clear the BlackArch catalog cache. Use when catalog is stale or after blackarch.org updates.

    Returns:
        Confirmation message.
    """
    try:
        if Path(CATALOG_CACHE_PATH).exists():
            Path(CATALOG_CACHE_PATH).unlink()
            return "Catalog cache cleared. Next list_blackarch_tools or blackarch_catalog will fetch fresh data."
        return "Catalog cache was already empty."
    except Exception as e:
        return f"[ERROR] {str(e)}"


@mcp.resource("blackarch://catalog")
def blackarch_catalog() -> str:
    """Searchable index of BlackArch tools (2,800+). Cached 24h."""
    return fetch_blackarch_catalog()


# =============================================================================
# ENTRY
# =============================================================================

if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", "8080"))
    mcp.run(transport="sse", host=host, port=port)
