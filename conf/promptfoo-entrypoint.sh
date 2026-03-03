#!/bin/sh
set -e

echo "[entrypoint] Setting permissions..."
chown -R 1001:1001 /app/promptfoo

echo "[entrypoint] Installing Python 3 + modelaudit..."
apk add --no-cache python3 py3-pip
pip3 install --break-system-packages modelaudit

echo "[entrypoint] Installing promptfoo..."
npm install -g promptfoo@latest

echo "[entrypoint] Starting PromptFoo report server on :${PROMPTFOO_INTERNAL_PORT:-15501}..."
promptfoo redteam report -p "${PROMPTFOO_INTERNAL_PORT:-15501}" &

echo "[entrypoint] Waiting for PromptFoo to be ready..."
until wget -q --spider "http://127.0.0.1:${PROMPTFOO_INTERNAL_PORT:-15501}/health" 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] PromptFoo is ready."

echo "[entrypoint] Starting cache-busting proxy on :${PROMPTFOO_PORT:-15500}..."
exec node /app/conf/promptfoo-proxy.js
