"""Turns the Claude version of the page into the website version: same game, same look,
   but parties and accounts go to this project's own server instead of Claude's storage."""
import sys, urllib.parse
src = open(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/bigrent/index.html').read()
def X(a, b, n=1):
    global src
    assert src.count(a) == n, ('COUNT %d: ' % src.count(a)) + a[:100]; src = src.replace(a, b)
def CUT(a, b, new):
    global src
    assert src.count(a) == 1, 'CUT ' + a[:90]; x = src.index(a); y = src.index(b, x + len(a)); src = src[:x] + new + src[y:]

X("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "three.min.js")
X("const HOME = 'https://claude.ai/artifact/JQrxkduzjUhHh5jZi9JTb5';", "const HOME = location.origin + location.pathname;")
X("Parties need everyone signed in to Claude with access to this page. Play works on one device anywhere.", "Parties need a connection to the game server. Play works without one.")
X("const adminOk = () => F.name.trim().toLowerCase() === 'louis' && (!Net.user || Net.owner === true);", "const adminOk = () => false;   // on the website nobody can hand themselves coins: the server keeps every account")
X("  const now = Date.now(), tb = $('#tmbar'), ck = $('#clock');", "  const now = Date.now() + skew, tb = $('#tmbar'), ck = $('#clock');")
X("const pz = openLoot(); if (!pz) return;", "const pz = await openLoot(); if (!pz) return;")
X("/* the account: coins, loot boxes, items and stats. Kept on the device and, when signed in, in the player's private data. */", "/* the account: coins, loot boxes, items and stats. The server keeps it; this is the page's copy of it. */")

# ---- talking to the server ----
CUT("function saveWallet() {", "/* coins and loot boxes won in a game land", r"""/* Every player has a long random key, made on first visit and kept in this browser. It is their account:
   no sign-up, and nobody else ever sees it (other players only see an id worked out from it). */
const KEY = (() => { let k = store.get('stakkz-key'); if (typeof k !== 'string' || !/^[a-f0-9]{48}$/.test(k)) { const a = new Uint8Array(24); crypto.getRandomValues(a); k = Array.from(a, x => ('0' + x.toString(16)).slice(-2)).join(''); store.set('stakkz-key', k); } return k; })();
let skew = 0;   // how far this device's clock is from the server's, so timers agree for everyone
async function api(path, body) {
  let r;
  try { r = await Promise.race([fetch('api/' + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ Authorization: 'Bearer ' + KEY }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }), new Promise((ok, no) => setTimeout(no, 12000))]); }
  catch (e) { throw { code: 'unavailable', message: 'Could not reach the server. Check your connection and try again.' }; }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (j.now) skew = j.now - Date.now();
  if (!r.ok) throw { code: r.status >= 500 || r.status === 429 ? 'unavailable' : 'refused', message: j.message || 'That did not work. Try again.', state: j.state };
  if (j.wallet) { setWallet(j.wallet); if (j.seal) store.set('stakkz-seal', { wallet: j.wallet, seal: j.seal }); }   // the sealed copy lets the server give the account back if it ever loses it
  return j;
}
function setWallet(w) { wallet = newWallet(Object.assign({}, w, { v: 3 })); store.set('bigrent-wallet', Object.assign({}, wallet, { name: F.name, look: F.look, pet: F.pet })); }
const refreshAcct = () => api('me').then(rerender, () => {});
/* name and look are sent to the server a moment after they change; a game played on this device reports what it earned */
function acctBody() {
  const b = { name: F.name, look: F.look, pet: F.pet };
  if (mode === 'local' && V && V.phase !== 'lobby' && V.players[0]) { const p = V.players[0], over = V.phase === 'over'; b.solo = { key: V.code + ':' + V.startedAt, coins: Math.floor((p.coins || 0) * (cpu ? 0.5 : 1)), boxes: p.boxes || 0, over: over, win: over && V.winners.indexOf(0) >= 0, rent: p.rentIn || 0, bought: p.bought || 0, kos: p.kos || 0, best: over ? E.worth(V, 0) : 0 }; }
  return b;
}
function syncAcct() { clearTimeout(wT); wT = 0; if (!Net.acct) return Promise.resolve(); wchain = wchain.then(() => api('me', acctBody())).then(() => { if (!G) rerender(); }, () => {}); return wchain; }
function saveWallet() {
  wallet.t = Date.now(); wallet.name = F.name; wallet.look = F.look; wallet.pet = F.pet; store.set('bigrent-wallet', wallet);
  clearTimeout(wT); wT = setTimeout(syncAcct, 700);
}
""")
X("    wallet.stats.rent += p.rentIn || 0; wallet.stats.bought += p.bought || 0; wallet.stats.kos += p.kos || 0; wallet.stats.best = Math.max(wallet.stats.best, E.worth(s, who)); dirty = true;",
  "    wallet.stats.rent += p.rentIn || 0; wallet.stats.bought += p.bought || 0; wallet.stats.kos += p.kos || 0; wallet.stats.best = Math.max(wallet.stats.best, E.worth(s, who)); dirty = true;\n    if (mode === 'online') setTimeout(refreshAcct, 1200);   // the server has the final word on what was earned")
CUT("function openLoot() {", "function wearItem(id) {", r"""/* the server opens the box and decides the prize */
async function openLoot() {
  if (wallet.boxes < 1) return null;
  try { return (await api('shop', { op: 'open' })).prize || null; } catch (e) { toast(e.message); return null; }
}
""")
CUT("function styleChanged() {", "function rerender() {", r"""function styleChanged() {
  fixLook(); saveWallet();
  if (G && mode === 'online' && me >= 0 && (G.phase === 'lobby' || (G.phase === 'play' && !G.players[me].out))) {
    // the server checks the look against what this account owns, then shows it to the party
    if (!styleQ) { styleQ = true; const code = G.code; lobbyJob = lobbyJob.then(() => { styleQ = false; return syncAcct(); }).then(() => api('party/' + code, { op: 'style' })).then(r => { if (r.state && G && G.code === code) take(r.state); }).catch(() => {}); }
  }
  else if (G && G.phase === 'play' && mode === 'local' && G.players[0] && !G.players[0].out) { try { adopt(E.act(G, 0, { t: 'style', look: F.look, pet: F.pet }, ctx())); } catch (e) {} }
  rerender();
}
""")
CUT("const capsReady = (async function () {", "/* in a game against the computer, or online", r"""const capsReady = (async function () {
  try { const kept = store.get('stakkz-seal'); let r = await api('me'); if (r.fresh && kept && kept.seal) { try { r = await api('restore', kept); } catch (e) {} } myId = r.id; Net.uid = r.id; Net.db = true; Net.acct = true; loadProfile(r.wallet); fixLook(); }
  catch (e) { Net.db = null; myId = 'offline'; }   // no server: games on this device still work
  Net.ready = true;
})();
""")
CUT("/* Moves on your own turn are shown at once", "const joinFn", r"""/* the server decides every move in a party, so there is nothing to save from here */
function push() {}
""")
CUT("const joinFn", "function actAs(", r"""/* A move in a party is sent to the server, which checks it against the rules, rolls any dice and sends the result to everyone.
   A game on this device is worked out here, with the same rules. */
let sending = false;
function act(a) {
  if (!G || (busy && a.t !== 'auto')) return false;
  if (mode !== 'online') { try { adopt(E.act(G, me, a, ctx())); return true; } catch (e) { if (a.t !== 'auto') toast(e.message); return false; } }
  if (sending) return false;
  sending = true; const code = G.code;
  return api('party/' + code, { op: 'act', a: a }).then(r => { sending = false; if (r.state && G && G.code === code) take(r.state); return true; },
    e => { sending = false; if (e.state && G && G.code === code && sane(e.state)) take(e.state); if (a.t !== 'auto') toast(e.message); else setTimeout(() => { autoV = -1; }, 1500); return false; });
}
""")
CUT("let healing = false, resub = 0;", "const BOTS = [", r"""/* a live line to the party: the server sends the game every time it changes. If the line drops it is reopened, and the server sends the latest game again. */
function subscribe(code) {
  if (Net.unsub) Net.unsub();
  let ws = null, dead = false, tries = 0, timer = 0;
  const ref = Net.ref = { code: code };
  const got = d => {
    if (Net.ref !== ref) return;
    if (!d) { if (G && G.code === code && G.phase !== 'over') { toast('That party has closed.'); goHome(); } return; }
    if (!sane(d) || d.code !== code) return;
    if (G && (d.v < G.v || (d.v === G.v && d.w === G.w))) return;
    const n = clone(d);
    // the game on this screen is over and someone has set up the next one: offer it instead of pulling this player in
    if (G && G.phase === 'over' && n.startedAt !== G.startedAt && !inParty(n)) { rematch = n; if (modal && modal.kind === 'winner') refreshModal(); return; }
    adopt(n);
  };
  const open = () => {
    if (dead) return; clearTimeout(timer);
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'api/party/' + code + '/ws'); } catch (e) { timer = setTimeout(open, 3000); return; }
    const mine = ws;
    mine.onmessage = e => { if (e.data === 'pong') return; let d; try { d = JSON.parse(e.data); } catch (x) { return; } tries = 0; if (d.now) skew = d.now - Date.now(); got(d.state); };
    mine.onclose = () => { if (!dead && ws === mine) timer = setTimeout(open, Math.min(8000, 500 * Math.pow(1.8, tries++))); };
    mine.onerror = () => { try { mine.close(); } catch (x) {} };
  };
  open();
  const beat = setInterval(() => { if (ws && ws.readyState === 1) { try { ws.send('ping'); } catch (x) {} } }, 25000);
  const wake = () => { if (!dead && !document.hidden && (!ws || ws.readyState > 1)) { tries = 0; open(); } };
  document.addEventListener('visibilitychange', wake); window.addEventListener('online', wake);
  Net.unsub = () => { dead = true; clearTimeout(timer); clearInterval(beat); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); try { ws.close(); } catch (x) {} };
  store.set('bigrent-room', code);
  try { history.replaceState(null, '', '#' + code); } catch (e) {}
}
async function online(quiet) {
  await capsReady;
  if (!Net.db) { try { const r = await api('me'); myId = r.id; Net.uid = r.id; Net.db = true; Net.acct = true; } catch (e) { if (!quiet) toast('Parties need a connection to the game server. Play works without one.'); return false; } }
  return true;
}
async function createRoom() {
  if (!(await online())) return;
  try { await syncAcct(); const r = await api('party', { mode: F.mode }); cpu = false; mode = 'online'; G = V = null; rematch = null; subscribe(r.state.code); adopt(r.state); }
  catch (e) { toast(e.message); }
}
async function joinRoom(code, quiet) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { if (!quiet) toast('Party codes are 4 letters.'); return; }
  if (!(await online(quiet))) return;
  try {
    let s = (await api('party/' + code)).state;
    if (!s || !sane(s)) { if (!quiet) toast('No party with the code ' + code + '.'); else store.del('bigrent-room'); return; }
    const inRoom = inParty(s);
    if (quiet && (!inRoom || s.phase === 'over')) { store.del('bigrent-room'); return; }
    if (!inRoom && s.phase === 'lobby') { await syncAcct(); s = (await api('party/' + code, { op: 'join' })).state; if (!inParty(s)) toast('That game has just started. You are watching.'); }
    else if (!inRoom) toast(s.phase === 'over' ? 'That game has finished.' : 'That game has already started. You are watching.');
    cpu = false; mode = 'online'; G = V = null; rematch = null; subscribe(code); adopt(s);
  } catch (e) { if (!quiet) toast(e.message); }
}
""")
X("subscribe(code); adopt(s); setTimeout(syncLook, 700); return;", "x", 0) if False else None
# ---- buttons ----
CUT("    case 'quit': {", "    case 'nudge':", r"""    case 'quit': {
      if (mode === 'online' && G && G.phase === 'play' && me >= 0 && G.players[me] && !G.players[me].out) { el.disabled = true; try { await api('party/' + G.code, { op: 'act', a: { t: 'quit' } }); } catch (er) {} }
      goHome(); break; }
    case 'leave': {
      if (mode === 'online' && G && G.phase === 'lobby' && me >= 0) { el.disabled = true; const code = G.code; if (Net.unsub) { Net.unsub(); Net.unsub = null; } try { await lobbyJob; await api('party/' + code, { op: 'leave' }); } catch (er) {} }
      goHome(); break; }
    case 'again': {
      if (mode === 'local') { closeModal(); $('#confetti').hidden = true; startLocal(); break; }
      if (!G) break;
      el.disabled = true;
      try {
        await syncAcct(); const n = (await api('party/' + G.code, { op: 'again' })).state;
        if (n && n.phase === 'lobby' && inParty(n)) { rematch = null; closeModal(); G = null; adopt(n); }
        else { toast(n && n.phase === 'play' ? 'That game has already started.' : 'Could not set up another game.'); el.disabled = false; }
      } catch (er) { toast(er.message); el.disabled = false; }
      break; }
""")
CUT("    case 'start': {", "    case 'home': goHome(); break;", r"""    case 'start': {
      if (!G || G.phase !== 'lobby') break;
      el.disabled = true;
      try { await lobbyJob; const r = await api('party/' + G.code, { op: 'start' }); if (r.state) take(r.state); }
      catch (er) { toast(er.message); el.disabled = false; }
      break; }
""")
X("      if (!owns(id)) { if (wallet.coins < it[2]) { toast('You need ' + fmt(it[2] - wallet.coins) + ' more coins.'); break; } wallet.coins -= it[2]; wallet.own.push(id); Snd('buy'); toast('The ' + it[1].toLowerCase() + ' is yours.'); }",
  "      if (!owns(id)) { if (wallet.coins < it[2]) { toast('You need ' + fmt(it[2] - wallet.coins) + ' more coins.'); break; } el.disabled = true; try { await syncAcct(); await api('shop', { op: 'buy', item: id }); } catch (er) { toast(er.message); el.disabled = false; break; } Snd('buy'); toast('The ' + it[1].toLowerCase() + ' is yours.'); }")
X("      wallet.coins -= BOX_PRICE; wallet.boxes++; saveWallet(); Snd('buy'); rerender(); break; }", "      el.disabled = true; try { await api('shop', { op: 'box' }); Snd('buy'); } catch (er) { toast(er.message); } rerender(); break; }")
X("if (act({ t: 'gift', to: i, n: n })) { wallet.coins -= n; saveWallet(); closeModal(); } break; }", "if (await act({ t: 'gift', to: i, n: n })) { closeModal(); refreshAcct(); } break; }")
X("    case 'propose': if (act({", "    case 'propose': if (await act({")
X("    case 'reset': wallet = freshWallet(); F.look = LOOK0(); F.pet = ''; F.reset = false; fixLook(); saveWallet();", "    case 'reset': try { await api('shop', { op: 'reset' }); } catch (er) { toast(er.message); break; } F.look = LOOK0(); F.pet = ''; F.reset = false; fixLook(); saveWallet();")
X('<script src="engine.js"></script>', '<script src="engine.js"></script>')

# ---- the finished page ----
R = []
def note(x, y, f): R.extend([(x + 1, y, 17, 13, '#000'), (x, y + 1, 19, 11, '#000'), (x + 1, y + 1, 17, 11, f)])
note(4, 0, '#6FC43A'); note(2, 2, '#7DCF3F'); note(0, 4, '#8FDD48')
for y, row in enumerate(['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..']):
    for x, c in enumerate(row):
        if c == '#': R.append((7 + x, 7 + y, 1, 1, '#000'))
icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -3 23 23" shape-rendering="crispEdges">' + ''.join('<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>' % r for r in R) + '</svg>'
page = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<link rel="icon" href="data:image/svg+xml,' + urllib.parse.quote(icon) + '">'
        '<meta name="description" content="Stakkz: a 3D city property game for 2 to 5 friends. Create a party, share the code, play in the browser.">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0;font:14px system-ui}[hidden]{display:none!important}img{max-width:100%}</style></head><body>\n'
        + src + '\n</body></html>\n')
open('/home/claude/stakkz/public/index.html', 'w').write(page)
left = [w for w in ['guarded(', 'Net.db.', 'claude.use', 'signed in to Claude', 'Contributor', 'pendingStyle = {'] if w in src]
print('page built', len(page), 'leftovers:', left)
