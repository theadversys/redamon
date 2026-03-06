#!/usr/bin/env bash
# Setup Neo4j env for local webapp dev (Vulnerabilities page)
# Run from project root: ./scripts/setup-neo4j-local.sh

set -e

WEBAPP_ENV="webapp/.env.local"
EXAMPLE="webapp/.env.local.example"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "[!] $EXAMPLE not found. Run from project root."
  exit 1
fi

if [[ -f "$WEBAPP_ENV" ]]; then
  if grep -q "NEO4J_URI" "$WEBAPP_ENV" 2>/dev/null; then
    echo "[*] $WEBAPP_ENV already has Neo4j vars. Check NEO4J_PASSWORD matches Neo4j."
    echo "    Verify: curl -s http://localhost:3000/api/health"
    exit 0
  fi
fi

echo "[*] Creating $WEBAPP_ENV from example..."
cp "$EXAMPLE" "$WEBAPP_ENV"
echo "[+] Done. Ensure Neo4j is running: docker compose up -d neo4j"
echo "    Then restart webapp: cd webapp && npm run dev"
echo "    Verify: curl -s http://localhost:3000/api/health"
