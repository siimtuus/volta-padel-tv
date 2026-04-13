const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT         = process.env.PORT || 3456;
const AUTH_HOST    = 'manager.playtomic.io';
const MANAGER_HOST = 'manager.playtomic.io';
const API_HOST     = 'api.playtomic.io';

// Credentials keskkonna muutujatest (Railway) või .env failist
const CLIENT_ID     = process.env.CLIENT_ID     || 'M2Y4NWM1MGMtOGRhZi00MmIwLTg4ZDAtYzE5OTliMDUzZjQ5';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 't12CTPAoDveAWCX';
const TENANT_ID     = process.env.TENANT_ID     || '89d8a83e-077f-4b17-ac61-ddde5ff229c0';

// Token cache
let tokenCache = null;
let tokenExpiry = 0;

function httpsRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const now = Date.now();
  if (tokenCache && now < tokenExpiry) return tokenCache;

  const body = JSON.stringify({ client_id: CLIENT_ID, secret: CLIENT_SECRET });
  const resp = await httpsRequest(AUTH_HOST, '/api/v1/oauth/token', 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }, body);

  if (resp.status !== 200) throw new Error(`Auth ebaõnnestus: ${resp.status} ${resp.body}`);

  const data = JSON.parse(resp.body);
  tokenCache = data.token;
  tokenExpiry = now + 55 * 60 * 1000;
  return tokenCache;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = new URL(req.url, 'http://localhost').pathname;

  try {
    // Serveeri HTML avaleht
    if (pathname === '/' || pathname === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'padelihall-tv.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html); return;
    }

    // GET /resources – väljakud
    if (pathname === '/resources') {
      const token = await getToken();
      const r = await httpsRequest(MANAGER_HOST,
        `/api/v1/tenants/${TENANT_ID}/resources`, 'GET',
        { Authorization: 'Bearer ' + token, Accept: 'application/json' }, null);
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(r.body); return;
    }

    // GET /bookings – tänased broneeringud
    if (pathname === '/bookings') {
      const token = await getToken();
      const today = new Date().toISOString().split('T')[0];
      const apiPath = `/api/v1/bookings?tenant_id=${TENANT_ID}` +
        `&start_booking_date=${today}T00:00:00&end_booking_date=${today}T23:59:59` +
        `&size=200&sort=booking_start_date,asc`;
      const r = await httpsRequest(API_HOST, apiPath, 'GET',
        { Authorization: 'Bearer ' + token, Accept: 'application/json' }, null);
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(r.body); return;
    }

    res.writeHead(404); res.end('Not found');

  } catch (err) {
    console.error('Viga:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ Volta Padel TV server töötab: http://localhost:${PORT}\n`);
});
