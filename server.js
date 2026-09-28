const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { rankOpportunities } = require('./matcher');
const opportunities = require('./data/opportunities.json');
const publicDir = path.join(__dirname, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/opportunities') return send(res, 200, opportunities);
  if (req.method === 'POST' && url.pathname === '/api/match') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 32_000) return send(res, 413, { error: 'Profile is too large.' });
      }
      return send(res, 200, { results: rankOpportunities(JSON.parse(body), opportunities) });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
  const allowed = new Set(['/', '/index.html', '/styles.css', '/app.js']);
  if (!allowed.has(url.pathname)) return send(res, 404, { error: 'Not found.' });
  const file = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  fs.readFile(file, (error, content) => {
    if (error) return send(res, 500, { error: 'Unable to load page.' });
    res.writeHead(200, { 'content-type': mime[path.extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

if (require.main === module) server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(`CareerMatch running on http://localhost:${process.env.PORT || 3000}`);
});
module.exports = server;
