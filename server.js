/* Stakkz server: serves the game, runs every party with the rules in src/core.js, and keeps the accounts.
   Plain Node (20 or newer) with one dependency, `ws`, for the live connection.   Start:  npm install && npm start */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as core from './src/core.js';

const DIR = path.dirname(fileURLToPath(import.meta.url)), PUB = path.join(DIR, 'public');
const PORT = Number(process.env.PORT) || 3000, DATA = process.env.DATA_FILE || path.join(DIR, 'data.json');
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ', IDLE = 48 * 3600 * 1000;
const parties = new Map(), accounts = new Map(), watchers = new Map();   // code -> game, id -> account, code -> sockets
let dirty = false, saved = {};
try { saved = JSON.parse(fs.readFileSync(DATA, 'utf8')); Object.entries(saved.parties || {}).forEach(([k, v]) => parties.set(k, v)); Object.entries(saved.accounts || {}).forEach(([k, v]) => accounts.set(k, v)); console.log('loaded', parties.size, 'parties and', accounts.size, 'accounts'); } catch (e) {}
/* Accounts are also handed back to each browser sealed with this secret, so if a free host wipes the disk
   a returning player's coins and items can be restored and cannot be forged. Set STAKKZ_SECRET to keep it stable. */
const SECRET = process.env.STAKKZ_SECRET || saved.secret || crypto.randomBytes(32).toString('hex');
const seal = (id, w) => crypto.createHmac('sha256', SECRET).update(id + ':' + JSON.stringify(w)).digest('base64url');
function save() { if (!dirty) return; dirty = false; fs.writeFile(DATA + '.tmp', JSON.stringify({ secret: SECRET, parties: Object.fromEntries(parties), accounts: Object.fromEntries(accounts) }), e => { if (!e) fs.rename(DATA + '.tmp', DATA, () => {}); }); }
setInterval(save, 4000).unref();
setInterval(() => { const now = Date.now(); parties.forEach((s, code) => { if (now - (s.touched || s.made || 0) > IDLE) { parties.delete(code); dirty = true; tell(code, null); } }); }, 600000).unref();

const idOf = key => 'p_' + crypto.createHash('sha256').update('stakkz:' + key).digest('hex').slice(0, 24);
const account = id => { let w = accounts.get(id); if (!w) { w = core.freshWallet(); w.fresh = true; accounts.set(id, w); } return w; };
function tell(code, s) { const set = watchers.get(code); if (!set) return; const m = JSON.stringify({ state: s, now: Date.now() }); set.forEach(ws => { try { ws.send(m); } catch (e) {} }); }
/* one request to a party; because Node runs one thing at a time, two moves can never collide */
function partyOp(code, op, user, body) {
  const prev = parties.get(code) || null, now = Date.now(), r = core.partyOp(prev, op, user, body, now, code);
  if (r.gone) { parties.delete(code); dirty = true; tell(code, null); return null; }
  if (r.state !== prev) {
    r.state.touched = now; parties.set(code, r.state); dirty = true;
    r.credits.forEach(c => { const w = account(c.id); core.credit(w, c.c, false, now); w.t = now; delete w.fresh; });
    tell(code, r.state);
  }
  return r.state;
}

const buckets = new Map();
function allowed(ip) { const now = Date.now(), b = buckets.get(ip) || { n: 80, t: now }; b.n = Math.min(80, b.n + (now - b.t) / 1000 * 20); b.t = now; buckets.set(ip, b); if (buckets.size > 5000) buckets.clear(); if (b.n < 1) return false; b.n--; return true; }
const send = (res, code, o) => { const buf = Buffer.from(JSON.stringify(o)); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': buf.length, 'Cache-Control': 'no-store' }); res.end(buf); };
const read = req => new Promise((ok, no) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > 20000) { no(new Error('big')); req.destroy(); } else parts.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { no(e); } }); req.on('error', no); });

async function api(req, res, parts) {
  const now = Date.now();
  if (parts[0] === 'ping') return send(res, 200, { ok: true, now, parties: parties.size });
  if (!allowed(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim())) return send(res, 429, { message: 'Slow down a little.' });
  if (parts[0] === 'party' && parts[1] && req.method === 'GET') return send(res, 200, { state: parties.get(parts[1]) || null, now });
  const key = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!/^[A-Za-z0-9]{32,128}$/.test(key)) return send(res, 401, { message: 'Missing player key.' });
  const id = idOf(key), w = account(id);
  let b = {}; if (req.method === 'POST') { try { b = await read(req); } catch (e) { return send(res, 400, { message: 'Bad request.' }); } }
  const mine = extra => { const fresh = !!w.fresh, out = Object.assign({}, w); delete out.fresh; return Object.assign({ wallet: out, seal: seal(id, out), fresh: fresh, id: id, now: now }, extra); };
  const touch = () => { w.t = now; delete w.fresh; dirty = true; };
  try {
    if (parts[0] === 'me') { if (req.method === 'POST') { core.setProfile(w, b); if (b.solo) core.credit(w, b.solo, true, now); touch(); } return send(res, 200, mine()); }
    if (parts[0] === 'restore' && req.method === 'POST') {
      // a sealed copy this server issued earlier, for an account it no longer has
      if (w.fresh && b.wallet && typeof b.seal === 'string' && b.seal === seal(id, b.wallet)) { Object.keys(w).forEach(k => delete w[k]); Object.assign(w, core.freshWallet(), b.wallet); core.setProfile(w, {}); touch(); }
      return send(res, 200, mine());
    }
    if (parts[0] === 'shop' && req.method === 'POST') { const out = core.shop(w, b.op, b.item); core.setProfile(w, {}); touch(); return send(res, 200, mine(out)); }
    if (parts[0] === 'party' && req.method === 'POST') {
      const user = { id: id, name: w.name, look: w.look, pet: w.pet };
      if (!parts[1]) {
        for (let k = 0; k < 20; k++) { const code = Array.from(crypto.randomBytes(4), x => AB[x % AB.length]).join(''); if (!parties.has(code)) return send(res, 200, { state: partyOp(code, 'create', user, b), now }); }
        return send(res, 503, { message: 'Could not make a party. Try again.' });
      }
      if (!/^[A-Z]{4}$/.test(parts[1])) return send(res, 400, { message: 'Party codes are 4 letters.' });
      const gift = b.op === 'act' && b.a && b.a.t === 'gift' ? Math.floor(Number(b.a.n) || 0) : 0;
      if (gift > 0) { core.spend(w, gift); touch(); }                       // coins leave the giver first
      try { return send(res, 200, { state: partyOp(parts[1], String(b.op), user, b), now }); }
      catch (e) { if (gift > 0) w.coins += gift; throw e; }
    }
  } catch (e) {
    if (e instanceof core.Refused) return send(res, 400, { message: e.message, state: parts[0] === 'party' && parts[1] ? parties.get(parts[1]) || null : undefined, now });
    console.error(e); return send(res, 500, { message: 'The server hit a problem. Try again.' });
  }
  send(res, 404, { message: 'Not found.' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
  const m = /\/api\/(.*)$/.exec(url.pathname);
  if (m) return api(req, res, m[1].split('/')).catch(e => { console.error(e); try { send(res, 500, { message: 'The server hit a problem.' }); } catch (x) {} });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const full = path.normalize(path.join(PUB, rel));
  if (!full.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': /three\.min\.js$/.test(full) ? 'public, max-age=604800' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
});
/* the live line: anyone with a party's code can watch it; the server sends the game whenever it changes */
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on('upgrade', (req, socket, head) => {
  const m = /\/api\/party\/([A-Z]{4})\/ws$/.exec(new URL(req.url, 'http://x').pathname);
  if (!m) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => {
    const code = m[1]; let set = watchers.get(code); if (!set) watchers.set(code, set = new Set());
    if (set.size >= 40) return ws.close(1013, 'full');
    set.add(ws); ws.send(JSON.stringify({ state: parties.get(code) || null, now: Date.now() }));
    ws.on('message', d => { if (String(d) === 'ping') { try { ws.send('pong'); } catch (e) {} } });
    ws.on('close', () => { set.delete(ws); if (!set.size) watchers.delete(code); });
    ws.on('error', () => {});
  });
});
server.listen(PORT, () => console.log('Stakkz is running on port ' + PORT));
process.on('SIGTERM', () => { dirty = true; save(); setTimeout(() => process.exit(0), 400); });
