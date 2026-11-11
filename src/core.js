/* Stakkz server rules. Everything that decides the game or a player's account happens here, on the server:
   the board rules (the same engine the page uses to draw and to play offline), dice, timers, coins, the shop and loot boxes.
   Pure functions: the worker loads and saves the data around them. */
import '../public/engine.js';
import { ITEMS, HAIRS } from './shop.js';

const E = globalThis.Engine;
export const BOX_PRICE = 8000;
const LOOT = [['coins', 40], [0, 32], [1, 18], [2, 8], [3, 2]];
const rarity = p => (p <= 5000 ? 0 : p <= 15000 ? 1 : p <= 50000 ? 2 : 3);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const ctx = now => ({ now: now, rand: rnd, die: () => 1 + Math.floor(rnd() * 6) });
/* a rule the player ran into (shown to them), as opposed to a fault in the server */
export class Refused extends Error {}
const refuse = m => { throw new Refused(m); };

/* ---------- accounts ---------- */
export function freshWallet() {
  return { v: 3, t: 0, coins: 10000, boxes: 1, own: [], claimed: [], games: {}, gb: {}, played: 0, wins: 0, soloAt: 0,
    stats: { earned: 0, rent: 0, bought: 0, kos: 0, best: 0, opened: 0 }, name: '', look: { skin: 0, hair: 'short', hc: 0, outfit: 'tee', hat: '', acc: '', bg: 'paper' }, pet: '' };
}
const owns = (w, id) => !!ITEMS[id] && (ITEMS[id][2] === 0 || w.own.indexOf(id) >= 0);
/* a look may only use what the account owns; anything else falls back to the free starter look */
export function setProfile(w, b) {
  if (typeof b.name === 'string') w.name = b.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const l = b.look && typeof b.look === 'object' ? b.look : w.look, out = { skin: int(l.skin, 0, 4), hc: int(l.hc, 0, 6), hair: 'short', outfit: 'tee', hat: '', acc: '', bg: 'paper' };
  if (HAIRS.indexOf(l.hair) >= 0) out.hair = l.hair;
  ['outfit', 'hat', 'acc', 'bg'].forEach(k => { const v = l[k]; if (typeof v === 'string' && v && owns(w, v) && ITEMS[v][0] === k) out[k] = v; });
  if (out.hc > 3 && !owns(w, 'dye')) out.hc = 0;
  w.look = out;
  const pet = typeof b.pet === 'string' ? b.pet : w.pet;
  w.pet = pet && owns(w, pet) && ITEMS[pet][0] === 'pet' ? pet : '';
}
function rollLoot(w) {
  let r = rnd() * 100, tier = 'coins';
  for (const q of LOOT) { if (r < q[1]) { tier = q[0]; break; } r -= q[1]; }
  if (tier === 'coins') return { coins: [2500, 3500, 5000, 7500][Math.floor(rnd() * 4)] };
  const pool = Object.keys(ITEMS).filter(id => ITEMS[id][2] > 0 && rarity(ITEMS[id][2]) === tier), fresh = pool.filter(id => !owns(w, id));
  if (fresh.length) return { item: fresh[Math.floor(rnd() * fresh.length)] };
  const d = pool[Math.floor(rnd() * pool.length)];
  return { coins: Math.max(500, Math.round(ITEMS[d][2] * 0.4 / 500) * 500), dupe: d };
}
export function shop(w, what, item) {
  if (what === 'buy') {
    const it = ITEMS[item]; if (!it || it[2] <= 0) refuse('That is not for sale.');
    if (owns(w, item)) return {};
    if (w.coins < it[2]) refuse('You need ' + (it[2] - w.coins).toLocaleString('en-GB') + ' more coins.');
    w.coins -= it[2]; w.own.push(item); return {};
  }
  if (what === 'box') { if (w.coins < BOX_PRICE) refuse('You need ' + (BOX_PRICE - w.coins).toLocaleString('en-GB') + ' more coins for a loot box.'); w.coins -= BOX_PRICE; w.boxes++; return {}; }
  if (what === 'open') {
    if (w.boxes < 1) refuse('No loot boxes left.');
    const pz = rollLoot(w); w.boxes--; w.stats.opened++;
    if (pz.item) w.own.push(pz.item); else w.coins += pz.coins;
    return { prize: pz };
  }
  if (what === 'reset') { const f = freshWallet(); Object.keys(w).forEach(k => delete w[k]); Object.assign(w, f); return {}; }
  refuse('Unknown request.');
}
/* coins and loot boxes won in a game. `c` comes from the party's own state, so it can be trusted;
   a game played on one device (against the computer, or passed around) is reported by the page, so it is capped. */
export function credit(w, c, solo, now) {
  const key = String(c.key || ''); let coins = int(c.coins, 0, 1e7), boxes = int(c.boxes, 0, 99);
  if (solo) {
    const m = /^LOCAL:(\d{13})$/.exec(key); if (!m || +m[1] > now + 3e5 || +m[1] < now - 8 * 36e5) return;
    if (!(key in w.games) && !(key in w.gb) && w.claimed.indexOf('s:' + key) < 0) { if (now - (w.soloAt || 0) < 180000) return; w.soloAt = now; }
    coins = Math.min(coins, 30000); boxes = Math.min(boxes, 4);
  }
  if (coins > (w.games[key] || 0)) { const d = coins - (w.games[key] || 0); w.coins += d; w.stats.earned += d; w.games[key] = coins; }
  if (boxes > (w.gb[key] || 0)) { w.boxes += boxes - (w.gb[key] || 0); w.gb[key] = boxes; }
  if (c.over && w.claimed.indexOf('s:' + key) < 0) {
    w.claimed.push('s:' + key); w.claimed = w.claimed.slice(-40); w.played++; if (c.win) w.wins++;
    w.stats.rent += int(c.rent, 0, 1e7); w.stats.bought += int(c.bought, 0, 99); w.stats.kos += int(c.kos, 0, 9); w.stats.best = Math.max(w.stats.best, int(c.best, 0, 1e7));
  }
  [w.games, w.gb].forEach(m => { const ks = Object.keys(m); if (ks.length > 12) delete m[ks[0]]; });
}
export function spend(w, n) { n = int(n, 0, 1e7); if (w.coins < n) refuse('You only have ' + w.coins.toLocaleString('en-GB') + ' coins.'); w.coins -= n; }

/* ---------- parties ---------- */
const ACTS = ['roll', 'payJail', 'useCard', 'buy', 'skip', 'end', 'build', 'sellHouse', 'sellProp', 'propose', 'accept', 'reject', 'cancel', 'rush', 'gift', 'quit', 'bankrupt', 'auto', 'bid', 'pass'];
/* only the fields an action can have, with the types the rules expect */
function cleanAct(a) {
  if (!a || ACTS.indexOf(a.t) < 0) refuse('Unknown move.');
  const tiles = v => (Array.isArray(v) ? v.slice(0, 28).map(x => int(x, 0, 39)) : []);
  return { t: a.t, tile: int(a.tile, 0, 39), to: int(a.to, 0, 4), n: int(a.n, 0, 20000), amt: int(a.amt, 0, 1e6), gc: int(a.gc, 0, 1e6), tc: int(a.tc, 0, 1e6), gp: tiles(a.gp), tp: tiles(a.tp) };
}
const seat = (s, id) => s.players.findIndex(p => p.id === id);
/* One request to a party. `s` is the stored state (null if there is none), `user` is who is asking, as the server knows them.
   Returns the new state, or `gone` when the party is finished with. Throws Refused for anything the rules do not allow. */
export function partyOp(s, op, user, body, now, code) {
  const me = s ? seat(s, user.id) : -1, name = user.name || 'Player ' + ((s ? s.players.length : 0) + 1);
  let n = s;
  try {
    if (op === 'create') {
      if (s) refuse('taken');
      const mode = body.mode === 'classic' ? 'classic' : Number(body.mode) === 45 ? 45 : 25;
      n = E.join(E.newRoom(code, { mode: mode, max: 5, timer: 45 }), user.id, user.name || 'Host', user.look, user.pet); n.made = now;
    } else if (!s) refuse('No party with the code ' + code + '.');
    else if (op === 'join') { if (s.phase === 'lobby' && me < 0) n = E.join(s, user.id, name, user.look, user.pet); }
    else if (op === 'leave') { if (s.phase === 'lobby' && me >= 0) { n = E.leave(s, user.id); if (!n.players.length) return { state: null, gone: true, credits: [] }; } }
    else if (op === 'style') {
      if (me < 0) refuse('You are not in this party.');
      if (s.phase === 'lobby') n = E.restyle(s, user.id, user.look, user.pet);
      else if (s.phase === 'play' && !s.players[me].out) { n = E.act(s, me, { t: 'style', look: user.look, pet: user.pet }, ctx(now)); n.players[me].name = s.players[me].name; }
    }
    else if (op === 'start') { if (me < 0) refuse('You are not in this party.'); n = E.start(s, me, ctx(now)); }
    else if (op === 'again') {
      if (s.phase === 'over') { if (me < 0) refuse('You were not in that game.'); n = E.restyle(E.again(s, user.id), user.id, user.look, user.pet); n.made = now; }
      else if (s.phase === 'lobby' && me < 0) n = E.join(s, user.id, name, user.look, user.pet);
    }
    else if (op === 'act') { if (me < 0) refuse('You are not playing in this game.'); n = E.act(s, me, cleanAct(body.a), ctx(now)); }
    else refuse('Unknown request.');
  } catch (e) {
    if (e instanceof Refused) throw e;
    if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) throw e;   // a fault, not a rule
    throw new Refused(e.message);                                                                     // the engine said no
  }
  return { state: n, credits: n === s ? [] : earnings(s, n) };
}
/* what each player has earned so far in this game, for anyone whose total has just changed */
function earnings(prev, next) {
  if (!next.startedAt || next.phase === 'lobby') return [];
  const key = next.code + ':' + next.startedAt, over = next.phase === 'over', fresh = !prev || prev.startedAt !== next.startedAt, ended = over && (!prev || prev.phase !== 'over');
  return next.players.map((p, i) => {
    const q = fresh ? null : prev.players[i];
    if (q && !ended && q.coins === p.coins && q.boxes === p.boxes && q.out === p.out) return null;
    return { id: p.id, c: { key: key, coins: p.coins, boxes: p.boxes, over: over, win: over && next.winners.indexOf(i) >= 0, rent: p.rentIn, bought: p.bought, kos: p.kos, best: over ? E.worth(next, i) : 0 } };
  }).filter(Boolean);
}
