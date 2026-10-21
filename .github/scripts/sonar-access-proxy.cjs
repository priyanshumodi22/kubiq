'use strict';

// Local-only adapter: the scanner cannot attach Cloudflare Access headers itself.
const http = require('node:http');
const https = require('node:https');

const id = process.env.CF_ACCESS_CLIENT_ID;
const secret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!id || !secret) throw new Error('Cloudflare Access credentials are missing');

http.createServer((req, res) => {
  // Never let the incoming request choose the upstream host or credentials.
  if (!req.url.startsWith('/') || req.url.startsWith('//')) {
    res.writeHead(400).end();
    return;
  }
  const headers = { ...req.headers, host: 'sonar.priyanshumodi.in',
    'cf-access-client-id': id, 'cf-access-client-secret': secret };
  delete headers['proxy-authorization'];
  const upstream = https.request({ hostname: 'sonar.priyanshumodi.in', port: 443,
    method: req.method, path: req.url, headers }, response => {
    // Do not follow redirects: credentials must never be sent elsewhere.
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}).listen(19000, '127.0.0.1');
