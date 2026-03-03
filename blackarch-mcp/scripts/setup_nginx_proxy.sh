#!/bin/bash
# Run on Linode: proxies port 80 -> 127.0.0.1:8080 (MCP)
# Workaround: Python/uvicorn may not respond to external IPs; nginx handles client connections.

set -e
apt-get update -qq && apt-get install -y -qq nginx

cat > /etc/nginx/sites-available/blackarch-mcp << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/blackarch-mcp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx proxy: port 80 -> 127.0.0.1:8080. Use http://<linode-ip>/sse"