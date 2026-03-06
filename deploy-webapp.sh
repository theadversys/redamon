#!/bin/bash
# Safe webapp deploy — prevents network mismatch on container recreate
set -e
cd "$(dirname "$0")"

echo "🔨 Building webapp image..."
docker compose build webapp

echo "🔄 Restarting webapp via compose (preserves network config)..."
docker compose stop webapp
docker compose rm -f webapp
docker compose up -d webapp

echo "⏳ Waiting for startup..."
sleep 8

STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
NETWORK=$(docker inspect pandaexploit-webapp --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)

echo "✅ HTTP: $STATUS | Network: $NETWORK"
if [[ "$NETWORK" == *"pandaexploit-network"* ]]; then
  echo "✅ Correct network — deploy successful"
else
  echo "⚠️  Wrong network detected! Run: docker rm -f pandaexploit-webapp && docker compose up -d webapp"
fi
