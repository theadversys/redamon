#!/bin/bash
# Rebuild recon image with latest code (run from project root)
set -e
cd "$(dirname "$0")/.."
echo "[*] Rebuilding recon image..."
docker compose --profile tools build recon
echo "[+] Done. Start a new recon run via the webapp."
