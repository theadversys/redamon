#!/usr/bin/env python3
"""
Check agent container connectivity to OpenAI API.
Run: docker compose exec agent python scripts/check_connectivity.py
"""
import os
import socket
import sys

def main():
    print("=== Agent Connectivity Check ===\n")

    # 1. API key
    key = os.getenv("OPENAI_API_KEY", "")
    if key:
        masked = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
        print(f"OPENAI_API_KEY: {masked} (set)")
    else:
        print("OPENAI_API_KEY: NOT SET")
        sys.exit(1)

    # 2. DNS (Python stdlib, no nslookup needed)
    host = "api.openai.com"
    try:
        ip = socket.gethostbyname(host)
        print(f"DNS {host}: {ip} (OK)")
    except socket.gaierror as e:
        print(f"DNS {host}: FAILED - {e}")
        sys.exit(1)

    # 3. TCP connect (no HTTPS, just check reachability)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, 443))
        s.close()
        print(f"TCP {host}:443: reachable (OK)")
    except OSError as e:
        print(f"TCP {host}:443: FAILED - {e}")
        sys.exit(1)

    # 4. Quick OpenAI API call (optional, requires httpx)
    # Respect OPENAI_VERIFY_SSL (default false in Docker for corporate proxies)
    verify_ssl = os.getenv("OPENAI_VERIFY_SSL", "true").lower() == "true"
    try:
        import httpx
        r = httpx.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=15,
            verify=verify_ssl
        )
        if r.status_code in (200, 401):
            print(f"HTTPS api.openai.com: {r.status_code} (OK)")
        else:
            print(f"HTTPS api.openai.com: {r.status_code}")
    except ImportError:
        print("HTTPS: skipped (httpx not installed)")
    except Exception as e:
        print(f"HTTPS api.openai.com: FAILED - {e}")
        sys.exit(1)

    print("\nAll checks passed.")

if __name__ == "__main__":
    main()
