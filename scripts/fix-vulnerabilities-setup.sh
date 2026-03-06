#!/usr/bin/env bash
# Fix vulnerabilities not displaying - ensures Neo4j and .env are correctly configured.
set -e
cd "$(dirname "$0")/.."

echo "=== Fix Vulnerabilities Setup ==="

# 1. Ensure .env exists
if [ ! -f .env ]; then
  echo "[1] Creating .env from .env.example..."
  cp .env.example .env
  echo "    Edit .env to add AI keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
else
  echo "[1] .env exists"
fi

# 2. Ensure NEO4J_PASSWORD in .env
if ! grep -q '^NEO4J_PASSWORD=changeme123' .env 2>/dev/null; then
  if grep -q '^NEO4J_PASSWORD=' .env; then
    echo "[2] Updating NEO4J_PASSWORD in .env to changeme123..."
    sed -i.bak 's/^NEO4J_PASSWORD=.*/NEO4J_PASSWORD=changeme123/' .env
  else
    echo "[2] Adding NEO4J_PASSWORD=changeme123 to .env..."
    echo "" >> .env
    echo "NEO4J_PASSWORD=changeme123" >> .env
  fi
else
  echo "[2] NEO4J_PASSWORD=changeme123 already set"
fi

# 3. Ensure webapp/.env.local for local dev
if [ ! -f webapp/.env.local ]; then
  echo "[3] Creating webapp/.env.local for local dev..."
  cat > webapp/.env.local << 'EOF'
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme123
RECON_OUTPUT_PATH=../recon/output
EOF
  echo "    Use this when running: cd webapp && npm run dev"
else
  echo "[3] webapp/.env.local exists"
fi

# 4. Reset Neo4j if requested (fixes wrong password from previous init)
if [ "${RESET_NEO4J:-}" = "1" ]; then
  echo "[4] Resetting Neo4j (RESET_NEO4J=1)..."
  docker compose down 2>/dev/null || true
  for v in $(docker volume ls -q 2>/dev/null | grep -i neo4j || true); do docker volume rm "$v" 2>/dev/null || true; done
  echo "    Neo4j volume removed. Start fresh with: docker compose up -d postgres neo4j webapp-init webapp"
else
  echo "[4] Skipping Neo4j reset (set RESET_NEO4J=1 to reset)"
fi

echo ""
echo "=== Next steps ==="
echo "Docker:  docker compose up -d postgres neo4j webapp-init webapp"
echo "Verify: curl -s http://localhost:3000/api/health"
echo "        Should return: {\"status\":\"ok\",\"neo4j\":\"ok\"}"
echo ""
echo "If still failing, run: RESET_NEO4J=1 ./scripts/fix-vulnerabilities-setup.sh"
echo "Then: docker compose up -d postgres neo4j webapp-init webapp"
