#!/bin/sh
# Generate self-signed TLS certificate for local development / air-gapped deployments
# Place certs in conf/certs/ — mounted into the nginx container
set -e
CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"
if [ -f "$CERT_DIR/nginx.crt" ] && [ -f "$CERT_DIR/nginx.key" ]; then
  echo "[nginx-tls] Certificates already exist, skipping generation."
  exit 0
fi
openssl req -x509 -nodes -days 3650 -newkey rsa:4096 \
  -keyout "$CERT_DIR/nginx.key" \
  -out    "$CERT_DIR/nginx.crt" \
  -subj "/C=US/ST=Security/L=Lab/O=PandaExploit/OU=RedTeam/CN=localhost" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
chmod 600 "$CERT_DIR/nginx.key"
echo "[nginx-tls] Certificates generated at $CERT_DIR"
