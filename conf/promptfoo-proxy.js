#!/usr/bin/env node
/**
 * Lightweight reverse proxy that sits in front of PromptFoo's built-in server.
 * Adds Cache-Control: no-store to all /api/* responses so browsers never serve
 * stale HTML from a previous proxy/rewrite configuration.
 */
const http = require('http');

const PROMPTFOO_PORT = parseInt(process.env.PROMPTFOO_INTERNAL_PORT || '15501', 10);
const PROXY_PORT = parseInt(process.env.PROMPTFOO_PORT || '15500', 10);

const server = http.createServer((clientReq, clientRes) => {
  const opts = {
    hostname: '127.0.0.1',
    port: PROMPTFOO_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: clientReq.headers,
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    const isApi = clientReq.url.startsWith('/api/');

    const headers = { ...proxyRes.headers };
    if (isApi) {
      headers['cache-control'] = 'no-store, no-cache, must-revalidate';
      headers['pragma'] = 'no-cache';
      delete headers['etag'];
    }

    clientRes.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'PromptFoo backend unavailable' }));
    }
  });

  clientReq.pipe(proxyReq, { end: true });
});

// Handle WebSocket upgrades (Socket.IO) by forwarding raw TCP
server.on('upgrade', (req, socket, head) => {
  const opts = {
    hostname: '127.0.0.1',
    port: PROMPTFOO_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(opts);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n'
    );
    if (proxyHead && proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(PROXY_PORT, () => {
  console.log(`Cache-busting proxy listening on :${PROXY_PORT} → PromptFoo :${PROMPTFOO_PORT}`);
});
