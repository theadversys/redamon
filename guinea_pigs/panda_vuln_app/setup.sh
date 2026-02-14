#!/bin/bash
# Setup script for Panda Vuln App - run on target host
set -e
cd "$(dirname "$0")"
docker compose build --no-cache
docker compose up -d
echo "[+] Panda Vuln App started on port 5002"
echo "[+] Health check: curl http://localhost:5002/health"
