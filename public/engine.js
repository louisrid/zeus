/* Stakkz rules engine. Pure: act(state, player, action, ctx) returns a new state or throws. */
(function (root) {
  'use strict';
  function ST(n, g, p, r) { return { n: n, t: 'st', g: g, p: p, r: r }; }
  var T = [
    { n: 'Start', t: 'go' },
    ST('Dustline', 0, 60, [2, 10, 30, 90, 160, 250]),
    { n: 'City Fund', t: 'fund' },
    ST('Cinder Row', 0, 60, [4, 20, 60, 180, 320, 450]),
    { n: 'Income Tax', t: 'tax', a: 200 },
    { n: 'Hyperloop South', t: 'rail', p: 200 },
    ST('District States', 1, 100, [6, 30, 90, 270, 400, 550]),
    { n: 'Lucky Dip', t: 'luck' },
    ST('Pipeline 9', 1, 100, [6, 30, 90, 270, 400, 550]),
    ST('Vector Lane', 1, 120, [8, 40, 100, 300, 450, 600]),
    { n: 'Jail', t: 'jail' },
    ST('Vitirio', 2, 140, [10, 50, 150, 450, 625, 750]),
    { n: 'Fusion Plant', t: 'util', p: 150 },
    ST('Sacha', 2, 140, [10, 50, 150, 450, 625, 750]),
    ST('Puplio', 2, 160, [12, 60, 180, 500, 700, 900]),
    { n: 'Porta Nova Station', t: 'rail', p: 200 },
    ST('Solara', 3, 180, [14, 70, 200, 550, 750, 950]),
    { n: 'City Fund', t: 'fund' },
    ST('Ambar Nueve', 3, 180, [14, 70, 200, 550, 750, 950]),
    ST('Costa Volt', 3, 200, [16, 80, 220, 600, 800, 1000]),
    { n: 'Zen Park', t: 'free' },
    ST('Tekihako City', 4, 220, [18, 90, 250, 700, 875, 1050]),
    { n: 'Lucky Dip', t: 'luck' },
    ST('Neo Sakura', 4, 220, [18, 90, 250, 700, 875, 1050]),
    ST('Kirameki Square', 4, 240, [20, 100, 300, 750, 925, 1100]),
    { n: 'Wunhan Station', t: 'rail', p: 200 },
    ST('Aurum Heights', 5, 260, [22, 110, 330, 800, 975, 1150]),
    ST('Helio Park', 5, 260, [22, 110, 330, 800, 975, 1150]),
    { n: 'Hydro Core', t: 'util', p: 150 },
    ST('Lumen Plaza', 5, 280, [24, 120, 360, 850, 1025, 1200]),
    { n: 'Go To Jail', t: 'gojail' },
    ST('Verdant Loop', 6, 300, [26, 130, 390, 900, 1100, 1275]),
    ST('Biodome 7', 6, 300, [26, 130, 390, 900, 1100, 1275]),
    { n: 'City Fund', t: 'fund' },
    ST('Emerald Arc', 6, 320, [28, 150, 450, 1000, 1200, 1400]),
    { n: 'Orbit Station', t: 'rail', p: 200 },
    { n: 'Lucky Dip', t: 'luck' },
    ST('Nova Crown', 7, 350, [35, 175, 500, 1100, 1300, 1500]),
    { n: 'Penthouse Tax', t: 'tax', a: 100 },
    ST('Zenith Spire', 7, 400, [50, 200, 600, 1400, 1700, 2000])
  ];
  var HC = [50, 50, 100, 100, 150, 150, 200, 200];
  var GN = ['Brown', 'Light Blue', 'Pink', 'Orange', 'Red', 'Yellow', 'Green', 'Dark Blue'];
  var GROUPS = {}, RAILS = [], UTILS = [];
  T.forEach(function (t, i) {
    if (t.t === 'st') (GROUPS[t.g] = GROUPS[t.g] || []).push(i);
    if (t.t === 'rail') RAILS.push(i);
    if (t.t === 'util') UTILS.push(i);
  });
  var CARDS = {
    luck: [
      { m: 'Zoom to Start. Collect £200.', x: 'to', tile: 0, k: 800 },
      { m: 'Your lottery ticket wins. Collect £50.', x: 'cash', a: 50, k: 800 },
      { m: 'Speeding ticket. Pay a £15 fine.', x: 'cash', a: -15 },
      { m: 'Advance to Zenith Spire.', x: 'to', tile: 39 },
      { m: 'Advance to Kirameki Square.', x: 'to', tile: 24 },
      { m: 'Go directly to Jail.', x: 'jail' },
      { m: 'Your side hustle pays off. Receive £100.', x: 'cash', a: 100, k: 800 },
      { m: 'Leaky roof. Pay £50 in repairs.', x: 'cash', a: -50 },
      { m: 'Wrong turn. Move back 3 spaces.', x: 'back', n: 3 },
      { m: 'Get Out of Jail Free. Keep this card.', x: 'gojf', k: 800 },
      { m: 'Catch the next train. Advance to the nearest station.', x: 'rail' },
      { m: 'You lost a bet. Pay every other player £50.', x: 'payall', a: 50 },
      { m: 'A loot box lands in your lap.', x: 'box' },
      { m: 'Coin Rush! Tap as many coins as you can.', x: 'rush' }
    ],
    fund: [
      { m: 'The city pays you back. Collect £200.', x: 'cash', a: 200, k: 800 },
      { m: "Doctor's fees. Pay £50.", x: 'cash', a: -50 },
      { m: 'An inheritance from a distant aunt. Receive £100.', x: 'cash', a: 100, k: 800 },
      { m: 'You sold your old bike. Collect £50.', x: 'cash', a: 50, k: 800 },
      { m: 'Hospital fees. Pay £100.', x: 'cash', a: -100 },
      { m: 'School fees. Pay £50.', x: 'cash', a: -50 },
      { m: 'You found cash in the sofa. Receive £25.', x: 'cash', a: 25, k: 800 },
      { m: 'Tax refund. Collect £20.', x: 'cash', a: 20, k: 800 },
      { m: 'Go directly to Jail.', x: 'jail' },
      { m: 'Get Out of Jail Free. Keep this card.', x: 'gojf', k: 800 },
      { m: "It's your birthday! Collect £10 from each other player.", x: 'getall', a: 10, k: 1500 },
      { m: 'Advance to Start. Collect £200.', x: 'to', tile: 0, k: 800 },
      { m: 'A loot box lands in your lap.', x: 'box' },
      { m: 'Street party! Everyone gets £20 and 1,500 coins.', x: 'party' }
    ]
  };
  var DECKN = { luck: 'Lucky Dip', fund: 'City Fund' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function need(c, m) { if (!c) throw new Error(m || 'Not allowed right now'); }
  function cur(s) { return s.order[s.turn]; }
  function owner(s, i) { return s.own[i] ? s.own[i].o : -1; }
  function lvl(s, i) { return s.own[i] ? s.own[i].h : 0; }
  function setOf(i) { var t = T[i]; return t.t === 'st' ? GROUPS[t.g] : t.t === 'rail' ? RAILS : t.t === 'util' ? UTILS : []; }
  function ownsGroup(s, pi, g) { return GROUPS[g].every(function (i) { return owner(s, i) === pi; }); }
  function props(s, pi) { var r = []; for (var i = 0; i < 40; i++) if (owner(s, i) === pi) r.push(i); return r; }
  function isProp(i) { var t = T[i].t; return t === 'st' || t === 'rail' || t === 'util'; }
  function rent(s, i, dice) {
    var t = T[i], o = owner(s, i);
    if (o < 0) return 0;
    if (t.t === 'st') { var h = lvl(s, i); return h > 0 ? t.r[h] : (ownsGroup(s, o, t.g) ? t.r[0] * 2 : t.r[0]); }
    var n = setOf(i).filter(function (j) { return owner(s, j) === o; }).length;
    if (t.t === 'rail') return [25, 50, 100, 200][n - 1];
    return dice * (n === 2 ? 10 : 4);
  }
  function worth(s, pi) {
    return s.players[pi].cash + props(s, pi).reduce(function (a, i) { return a + T[i].p + (T[i].t === 'st' ? lvl(s, i) * HC[T[i].g] : 0); }, 0);
  }
  function groupClear(s, i) { return setOf(i).every(function (j) { return lvl(s, j) === 0; }); }
  function canBuild(s, pi, i) {
    var t = T[i];
    if (s.phase !== 'play' || pi !== cur(s) || s.trade || (s.stage !== 'roll' && s.stage !== 'act')) return false;
    if (t.t !== 'st' || !ownsGroup(s, pi, t.g) || lvl(s, i) >= 5) return false;
    var mn = Math.min.apply(null, GROUPS[t.g].map(function (j) { return lvl(s, j); }));
    return lvl(s, i) === mn && s.players[pi].cash >= HC[t.g];
  }
  function canSellHouse(s, pi, i) {
    var t = T[i];
    if (s.phase !== 'play' || pi !== cur(s) || s.trade || ['roll', 'act', 'debt'].indexOf(s.stage) < 0) return false;
    if (t.t !== 'st' || owner(s, i) !== pi || lvl(s, i) === 0) return false;
    var mx = Math.max.apply(null, GROUPS[t.g].map(function (j) { return lvl(s, j); }));
    return lvl(s, i) === mx;
  }
  function canSellProp(s, pi, i) {
    if (s.phase !== 'play' || pi !== cur(s) || s.trade || ['roll', 'act', 'debt'].indexOf(s.stage) < 0) return false;
    return owner(s, i) === pi && groupClear(s, i);
  }
  function tradeable(s, pi, i) { return owner(s, i) === pi && groupClear(s, i); }
  function debtTotal(s) { return s.debts.reduce(function (a, d) { return a + d.a; }, 0); }

  function log(s, p, m) { s.log.push({ p: p, m: m }); if (s.log.length > 40) s.log.shift(); }
  function nm(s, i) { return s.players[i].name; }

  function newRoom(code, settings) {
    return {
      v: 1, w: '', code: code, phase: 'lobby', mode: settings.mode || 'classic', max: settings.max || 5,
      timer: settings.timer || 0, players: [], order: [], turn: 0, own: {}, dice: [1, 1], dbl: 0, again: false,
      stage: 'lobby', debts: [], then: 0, trade: null, decks: { luck: [], fund: [] }, log: [], fx: [],
      rush: -1, deadline: 0, t: 0, startedAt: 0, endAt: 0, winners: [], busts: 0, auc: null
    };
  }
  function cleanLook(l) {
    l = l && typeof l === 'object' ? l : {};
    var st = function (v) { return String(v || '').replace(/[^a-z]/g, '').slice(0, 12); };
    return { skin: Math.max(0, Math.min(4, l.skin | 0)), hc: Math.max(0, Math.min(6, l.hc | 0)), hair: st(l.hair) || 'short', outfit: st(l.outfit) || 'tee', hat: st(l.hat), acc: st(l.acc), bg: st(l.bg) };
  }
  function cleanPet(p) { return String(p || '').replace(/[^a-z]/g, '').slice(0, 12); }
  function give(s, pi, n) { if (n > 0) { s.players[pi].coins += n; s.fx.push({ t: 'coin', p: pi, n: n }); } }
  function setBonus(s, pi, i) {
    if (T[i].t === 'st' && ownsGroup(s, pi, T[i].g)) { give(s, pi, 4000); log(s, pi, s.players[pi].name + ' completed the ' + GN[T[i].g] + ' set.'); }
  }
  function restyle(s0, id, look, pet) {
    var s = clone(s0);
    need(s.phase === 'lobby', 'The game has already started');
    s.players.forEach(function (p) { if (p.id === id) { p.look = cleanLook(look); p.pet = cleanPet(pet); } });
    s.v++; s.w = 'style' + id + s.v; s.fx = [];
    return s;
  }
  function join(s0, id, name, look, pet) {
    var s = clone(s0);
    need(s.phase === 'lobby', 'That game has already started');
    need(s.players.length < s.max, 'That party is full');
    need(!s.players.some(function (p) { return p.id === id; }), 'You are already in this party');
    s.players.push({ id: id, name: String(name || 'Player').slice(0, 12), look: cleanLook(look), pet: cleanPet(pet), coins: 0, boxes: 0, nb: 0, cash: 1500, pos: 0, jail: false, jt: 0, gojf: [], out: false, rentIn: 0, bought: 0, kos: 0, turns: 0 });
    s.v++; s.w = id + s.v; s.fx = [];
    return s;
  }
  /* the game is over and someone wants another: the party goes back to its lobby with that player in it */
  function again(s0, id) {
    need(s0.phase === 'over', 'That game is still going');
    var old = s0.players.filter(function (p) { return p.id === id; })[0];
    need(old, 'You were not in that game');
    var s = join(newRoom(s0.code, { mode: s0.mode, max: s0.max, timer: s0.timer }), id, old.name, old.look, old.pet);
    s.v = s0.v + 1; s.w = 'again' + id + s.v;
    return s;
  }
  function leave(s0, id) {
    var s = clone(s0);
    need(s.phase === 'lobby', 'The game has already started');
    s.players = s.players.filter(function (p) { return p.id !== id; });
    s.v++; s.w = 'leave' + id + s.v; s.fx = [];
    return s;
  }
  /* loot boxes: about two turn up for each player in a game, on the clock rather than on luck alone */
  function gameLen(s) { return (s.mode === 'classic' ? 30 : Number(s.mode)) * 60000; }
  function lootDrop(s, pi, ctx) {
    var p = s.players[pi];
    if (s.phase !== 'play' || p.out || !p.nb || ctx.now < p.nb) return;
    p.boxes++; p.nb = ctx.now + (0.4 + ctx.rand() * 0.2) * gameLen(s);
    s.fx.push({ t: 'box', p: pi }); log(s, pi, p.name + ' found a loot box.');
  }
  function shuffle(a, ctx) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(ctx.rand() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function start(s0, pi, ctx) {
    var s = clone(s0);
    need(s.phase === 'lobby', 'The game has already started');
    need(pi === 0, 'Only the host can start the game');
    need(s.players.length >= 2, 'You need at least 2 players');
    s.order = shuffle(s.players.map(function (p, i) { return i; }), ctx);
    s.phase = 'play'; s.turn = 0; s.startedAt = ctx.now;
    s.endAt = s.mode === 'classic' ? 0 : ctx.now + Number(s.mode) * 60000;
    s.players.forEach(function (p) { p.nb = ctx.now + (0.15 + ctx.rand() * 0.3) * gameLen(s); });
    s.v++; s.w = 'start' + ctx.rand(); s.fx = [];
    log(s, -1, 'The game began. ' + nm(s, cur(s)) + ' goes first.');
    beginTurn(s, ctx);
    return s;
  }
  function beginTurn(s, ctx) {
    s.stage = 'roll'; s.dbl = 0; s.again = false; s.then = 0; s.rush = -1; s.t = ctx.now;
    s.deadline = s.timer ? ctx.now + s.timer * 1000 : 0;
    s.fx.push({ t: 'turn', p: cur(s) });
  }
  function win(s, list) {
    s.phase = 'over'; s.stage = 'over'; s.winners = list; s.deadline = 0; s.trade = null; s.debts = []; s.auc = null;
    s.players.forEach(function (p, i) { var w = list.indexOf(i) >= 0; p.coins += w ? 20000 : 8000; p.boxes += w ? 2 : 1; });
    s.fx.push({ t: 'win' });
    log(s, list[0], list.map(function (i) { return nm(s, i); }).join(' and ') + ' won the game!');
  }
  function endTurn(s, ctx) {
    s.players[cur(s)].turns++;
    if (s.endAt && ctx.now >= s.endAt) {
      var ts = s.order.map(function (i) { return s.players[i].turns; });
      if (ts.every(function (x) { return x === ts[0]; })) {
        var best = Math.max.apply(null, s.order.map(function (i) { return worth(s, i); }));
        var top = s.order.filter(function (i) { return worth(s, i) === best; });
        var bc = Math.max.apply(null, top.map(function (i) { return s.players[i].cash; }));
        log(s, -1, 'Time is up.');
        win(s, top.filter(function (i) { return s.players[i].cash === bc; }));
        return;
      }
    }
    s.turn = (s.turn + 1) % s.order.length;
    beginTurn(s, ctx);
  }
  function xfer(s, from, to, a) {
    s.players[from].cash -= a;
    if (to >= 0) s.players[to].cash += a;
    s.fx.push({ t: 'pay', from: from, to: to, a: a });
  }
  function bankrupt(s, pi, to, ctx, quiet) {
    var p = s.players[pi], wasCur = cur(s) === pi;
    var refund = 0;
    props(s, pi).forEach(function (i) {
      if (T[i].t === 'st') refund += lvl(s, i) * HC[T[i].g] / 2;
      if (to >= 0) s.own[i] = { o: to, h: 0 }; else delete s.own[i];
    });
    if (to >= 0) { s.players[to].cash += Math.max(0, p.cash) + refund; s.players[to].kos++; give(s, to, 4000); }
    p.cash = 0; p.out = true; p.jail = false; p.gojf = [];
    s.busts++; s.debts = []; s.then = 0; s.trade = null;
    s.fx.push({ t: 'bust', p: pi });
    if (!quiet) log(s, pi, p.name + ' went bankrupt' + (to >= 0 ? ' to ' + nm(s, to) : '') + '.');
    var idx = s.order.indexOf(pi);
    s.order.splice(idx, 1);
    if (idx < s.turn) s.turn--;
    if (s.order.length === 1) { win(s, [s.order[0]]); return; }
    if (wasCur) { s.turn = s.turn % s.order.length; beginTurn(s, ctx); }
  }
  function dropOut(s, pi, ctx) {
    var p = s.players[pi];
    log(s, pi, p.name + ' left the game.');
    if (s.auc) { if (pi === cur(s)) { s.auc = null; s.stage = 'res'; } else aucDrop(s, pi, ctx); }
    if (pi === cur(s)) { bankrupt(s, pi, s.debts.length ? s.debts[0].to : -1, ctx, true); return; }
    props(s, pi).forEach(function (i) { delete s.own[i]; });
    p.cash = 0; p.out = true; p.jail = false; p.gojf = []; s.busts++;
    if (s.trade && (s.trade.from === pi || s.trade.to === pi)) s.trade = null;
    s.debts.forEach(function (d) { if (d.to === pi) d.to = -1; });
    if (s.rush === pi) s.rush = -1;
    s.fx.push({ t: 'bust', p: pi });
    var idx = s.order.indexOf(pi);
    s.order.splice(idx, 1);
    if (idx < s.turn) s.turn--;
    if (s.order.length === 1) win(s, [s.order[0]]);
  }
  /* A street nobody bought goes to auction. Everyone still in with at least £10 bids in turn, starting after the
     player whose turn it is; each either raises by £10 or more, or passes and is out. The last bidder left wins. */
  function startAuction(s, tile, ctx) {
    var k = s.order.indexOf(cur(s)), live = [];
    for (var j = 1; j <= s.order.length; j++) { var q = s.order[(k + j) % s.order.length]; if (s.players[q].cash >= 10) live.push(q); }
    if (!live.length) { s.stage = 'res'; return; }
    s.auc = { tile: tile, bid: 0, by: -1, who: live[0], live: live };
    s.stage = 'auction'; s.fx.push({ t: 'auction', tile: tile });
    log(s, -1, T[tile].n + ' goes to auction.');
    aucClock(s, ctx);
  }
  function aucClock(s, ctx) { s.t = ctx.now; s.deadline = s.timer ? ctx.now + 15000 : 0; }
  function aucEnd(s, ctx) {
    var a = s.auc, w = a.by, t = T[a.tile];
    s.auc = null; s.stage = 'res'; s.t = ctx.now; s.deadline = s.timer ? ctx.now + s.timer * 1000 : 0;
    if (w < 0) { s.fx.push({ t: 'unsold', tile: a.tile }); log(s, -1, 'Nobody bid for ' + t.n + '.'); return; }
    xfer(s, w, -1, a.bid); s.own[a.tile] = { o: w, h: 0 };
    s.fx.push({ t: 'sold', tile: a.tile, p: w, a: a.bid }); s.players[w].bought++; give(s, w, 400); setBonus(s, w, a.tile);
    log(s, w, nm(s, w) + ' won ' + t.n + ' at auction for £' + a.bid + '.');
  }
  function aucStep(s, ctx) { var a = s.auc; if (!a.live.length || (a.live.length === 1 && a.by === a.live[0])) aucEnd(s, ctx); else aucClock(s, ctx); }
  function aucBid(s, pi, amt, ctx) {
    var a = s.auc, least = Math.max(10, a.bid + 10);
    need(Number.isInteger(amt) && amt >= least, 'Bid at least £' + least);
    need(amt <= s.players[pi].cash, "You don't have that much cash");
    a.bid = amt; a.by = pi; s.fx.push({ t: 'bid', p: pi, a: amt, tile: a.tile });
    a.who = a.live[(a.live.indexOf(pi) + 1) % a.live.length];
    aucStep(s, ctx);
  }
  function aucDrop(s, pi, ctx) {
    var a = s.auc, k = a.live.indexOf(pi); if (k < 0) return;
    a.live.splice(k, 1);
    if (a.by === pi) { a.by = -1; a.bid = 0; }
    if (a.who === pi && a.live.length) a.who = a.live[k % a.live.length];
    aucStep(s, ctx);
  }
  function settle(s, ctx) {
    var pi = cur(s), p = s.players[pi];
    while (s.debts.length) {
      var d = s.debts[0];
      if (p.cash >= d.a) {
        xfer(s, pi, d.to, d.a);
        if (d.rent && d.to >= 0) { s.players[d.to].rentIn += d.a; give(s, d.to, d.a * 3); }
        log(s, pi, d.to >= 0 ? p.name + ' paid ' + nm(s, d.to) + ' £' + d.a + (d.rent ? ' rent' : '') + '.' : p.name + ' paid £' + d.a + (d.why ? ' ' + d.why : '') + '.');
        s.debts.shift();
      } else {
        if (!props(s, pi).length) { bankrupt(s, pi, d.to, ctx); return; }
        s.stage = 'debt'; return;
      }
    }
    if (s.stage === 'debt') s.stage = 'res';
    if (s.then) { var n = s.then; s.then = 0; moveBy(s, pi, n, ctx); }
  }
  function charge(s, list, ctx) { list.forEach(function (d) { s.debts.push(d); }); settle(s, ctx); }
  function goJail(s, pi) {
    var p = s.players[pi];
    s.fx.push({ t: 'move', p: pi, from: p.pos, to: 10, dir: 0 });
    p.pos = 10; p.jail = true; p.jt = 0; s.again = false; s.dbl = 0;
    log(s, pi, p.name + ' went to Jail.');
  }
  function moveBy(s, pi, n, ctx) {
    var p = s.players[pi], from = p.pos, to = (from + n + 40) % 40;
    s.fx.push({ t: 'move', p: pi, from: from, to: to, dir: n > 0 ? 1 : -1 });
    p.pos = to;
    if (n > 0 && to < from) { p.coins += 800; p.cash += 200; s.fx.push({ t: 'pay', from: -1, to: pi, a: 200 }); log(s, pi, p.name + ' passed Start and collected £200.'); }
    land(s, pi, ctx);
  }
  function draw(s, pi, deck, ctx) {
    var p = s.players[pi];
    if (!s.decks[deck].length) {
      var held = s.players.some(function (q) { return q.gojf.indexOf(deck) >= 0; });
      s.decks[deck] = shuffle(CARDS[deck].map(function (c, i) { return i; }).filter(function (i) { return !(held && CARDS[deck][i].x === 'gojf'); }), ctx);
    }
    var c = CARDS[deck][s.decks[deck].shift()];
    var cf = { t: 'card', deck: deck, m: c.m, p: pi, x: c.x, a: c.a || 0, k: c.k || 0 }; s.fx.push(cf);
    if (c.k) p.coins += c.k;
    log(s, pi, p.name + ' drew ' + DECKN[deck] + ': ' + c.m);
    var others = s.order.filter(function (i) { return i !== pi; });
    switch (c.x) {
      case 'cash':
        if (c.a >= 0) { p.cash += c.a; s.fx.push({ t: 'pay', from: -1, to: pi, a: c.a }); }
        else charge(s, [{ a: -c.a, to: -1 }], ctx);
        break;
      case 'to': moveBy(s, pi, ((c.tile - p.pos + 40) % 40) || 40, ctx); break;
      case 'jail': goJail(s, pi); break;
      case 'back': moveBy(s, pi, -c.n, ctx); break;
      case 'gojf': p.gojf.push(deck); break;
      case 'rail':
        var n = 1; while (T[(p.pos + n) % 40].t !== 'rail') n++;
        moveBy(s, pi, n, ctx); break;
      case 'payall': charge(s, others.map(function (i) { return { a: c.a, to: i }; }), ctx); break;
      case 'rush': s.rush = pi; s.fx.push({ t: 'rush', p: pi }); break;
      case 'box': p.boxes++; cf.box = 1; break;
      case 'party':
        s.order.forEach(function (i) { s.players[i].cash += 20; s.players[i].coins += 1500; s.fx.push({ t: 'pay', from: -1, to: i, a: 20 }); });
        break;
      case 'getall':
        others.forEach(function (i) { var a = Math.min(c.a, s.players[i].cash); if (a > 0) xfer(s, i, pi, a); });
        break;
    }
  }
  function land(s, pi, ctx) {
    var p = s.players[pi], i = p.pos, t = T[i];
    if (isProp(i)) {
      var o = owner(s, i);
      if (o < 0) {
        if (p.cash >= t.p) s.stage = 'buy';
        else { log(s, pi, p.name + " can't afford " + t.n + '.'); startAuction(s, i, ctx); }
      } else if (o !== pi) {
        charge(s, [{ a: rent(s, i, s.dice[0] + s.dice[1]), to: o, rent: true }], ctx);
      }
    } else if (t.t === 'tax') charge(s, [{ a: t.a, to: -1, why: t.n }], ctx);
    else if (t.t === 'luck' || t.t === 'fund') draw(s, pi, t.t, ctx);
    else if (t.t === 'gojail') goJail(s, pi);
    else if (t.t === 'free') { s.rush = pi; s.fx.push({ t: 'rush', p: pi }); log(s, pi, p.name + ' is taking a break in Zen Park.'); }
  }
  function doRoll(s, ctx) { var c = cur(s); rollCore(s, ctx); lootDrop(s, c, ctx); }
  function rollCore(s, ctx) {
    var c = cur(s), p = s.players[c], a = ctx.die(), b = ctx.die(), tot = a + b, dbl = a === b;
    s.dice = [a, b];
    s.fx.push({ t: 'dice', p: c, d: [a, b] });
    log(s, c, p.name + ' rolled ' + tot + (dbl ? ' (doubles)' : '') + '.');
    if (s.timer) s.deadline = ctx.now + s.timer * 1000 + 3000;
    if (p.jail) {
      if (dbl) { p.jail = false; p.jt = 0; s.again = false; s.stage = 'res'; log(s, c, p.name + ' rolled doubles and left Jail.'); moveBy(s, c, tot, ctx); }
      else {
        p.jt++;
        if (p.jt >= 3) { p.jail = false; p.jt = 0; s.again = false; s.stage = 'res'; s.then = tot; charge(s, [{ a: 50, to: -1, why: 'to leave Jail' }], ctx); }
        else { s.stage = 'act'; log(s, c, p.name + ' stays in Jail.'); }
      }
      return;
    }
    if (dbl) {
      give(s, c, 400); s.dbl++;
      if (s.dbl === 3) { log(s, c, p.name + ' rolled three doubles in a row.'); goJail(s, c); s.stage = 'act'; return; }
    }
    s.again = dbl; s.stage = 'res';
    moveBy(s, c, tot, ctx);
  }
  function sellHouse(s, pi, i) {
    var g = T[i].g; s.own[i].h--; s.players[pi].cash += HC[g] / 2;
    s.fx.push({ t: 'pay', from: -1, to: pi, a: HC[g] / 2 });
  }
  function sellProp(s, pi, i) {
    delete s.own[i]; s.players[pi].cash += T[i].p / 2;
    s.fx.push({ t: 'pay', from: -1, to: pi, a: T[i].p / 2 });
  }
  function checkTrade(s, tr) {
    var A = s.players[tr.from], B = s.players[tr.to];
    need(B && !B.out && tr.to !== tr.from, 'Pick another player to trade with');
    need(Number.isInteger(tr.gc) && Number.isInteger(tr.tc) && tr.gc >= 0 && tr.tc >= 0, 'Enter whole amounts of cash');
    need(tr.gc <= A.cash, A.name + " doesn't have that much cash");
    need(tr.tc <= B.cash, B.name + " doesn't have that much cash");
    need(tr.gp.every(function (i) { return tradeable(s, tr.from, i); }) && tr.tp.every(function (i) { return tradeable(s, tr.to, i); }), 'Sell the buildings on a colour set before trading it');
    need(tr.gc + tr.tc + tr.gp.length + tr.tp.length > 0, 'Add something to the trade');
  }
  function finish(s) {
    if (s.phase === 'play' && s.stage === 'res') {
      if (s.players[cur(s)].jail) s.again = false;
      s.stage = s.again ? 'roll' : 'act';
    }
  }

  function act(s0, pi, a, ctx) {
    var s = clone(s0);
    need(s.phase === 'play', 'The game is not running');
    need(pi >= 0 && s.players[pi] && !s.players[pi].out, 'You are not playing in this game');
    s.fx = []; s.v++; s.w = pi + ':' + ctx.rand();
    var c = cur(s), p = s.players[pi], i = a.tile;
    if (pi === c) s.t = ctx.now;
    switch (a.t) {
      case 'roll':
        need(pi === c && s.stage === 'roll' && !s.trade, "You can't roll right now");
        doRoll(s, ctx); break;
      case 'payJail':
        need(pi === c && s.stage === 'roll' && p.jail && !s.trade, "You can't do that right now");
        need(p.cash >= 50, 'You need £50 to leave Jail');
        xfer(s, pi, -1, 50); p.jail = false; p.jt = 0;
        log(s, pi, p.name + ' paid £50 to leave Jail.'); break;
      case 'useCard':
        need(pi === c && s.stage === 'roll' && p.jail && p.gojf.length && !s.trade, "You can't do that right now");
        p.gojf.shift(); p.jail = false; p.jt = 0;
        log(s, pi, p.name + ' used a Get Out of Jail Free card.'); break;
      case 'buy':
        need(pi === c && s.stage === 'buy', 'Nothing to buy right now');
        need(owner(s, p.pos) < 0 && p.cash >= T[p.pos].p, "You can't afford that");
        xfer(s, pi, -1, T[p.pos].p); s.own[p.pos] = { o: pi, h: 0 };
        s.fx.push({ t: 'buy', tile: p.pos, p: pi }); p.bought++; give(s, pi, 400); setBonus(s, pi, p.pos);
        log(s, pi, p.name + ' bought ' + T[p.pos].n + ' for £' + T[p.pos].p + '.');
        s.stage = 'res'; break;
      case 'skip':
        need(pi === c && s.stage === 'buy', 'Nothing to skip right now');
        log(s, pi, p.name + ' passed on ' + T[p.pos].n + '.');
        startAuction(s, p.pos, ctx); break;
      case 'bid':
        need(s.stage === 'auction' && s.auc && s.auc.who === pi, 'It is not your bid');
        aucBid(s, pi, a.amt | 0, ctx); break;
      case 'pass':
        need(s.stage === 'auction' && s.auc && s.auc.who === pi, 'It is not your bid');
        s.fx.push({ t: 'pass', p: pi }); aucDrop(s, pi, ctx); break;
      case 'end':
        need(pi === c && s.stage === 'act' && !s.trade, "You can't end your turn yet");
        endTurn(s, ctx); break;
      case 'build':
        need(canBuild(s, pi, i), "You can't build there. Build evenly across the full colour set.");
        xfer(s, pi, -1, HC[T[i].g]); s.own[i].h++;
        s.fx.push({ t: 'build', tile: i }); give(s, pi, s.own[i].h === 5 ? 1500 : 150);
        log(s, pi, p.name + (s.own[i].h === 5 ? ' built a hotel on ' : ' built a house on ') + T[i].n + '.'); break;
      case 'sellHouse':
        need(canSellHouse(s, pi, i), "You can't sell that. Sell evenly across the colour set.");
        var was = s.own[i].h; sellHouse(s, pi, i);
        log(s, pi, p.name + (was === 5 ? ' downgraded the hotel on ' : ' sold a house on ') + T[i].n + '.');
        if (s.stage === 'debt') settle(s, ctx); break;
      case 'sellProp':
        need(canSellProp(s, pi, i), 'Sell the buildings on that colour set first');
        sellProp(s, pi, i);
        log(s, pi, p.name + ' sold ' + T[i].n + ' to the bank for £' + T[i].p / 2 + '.');
        if (s.stage === 'debt') settle(s, ctx); break;
      case 'propose':
        need(pi === c && !s.trade && ['roll', 'act', 'debt'].indexOf(s.stage) >= 0, "You can only offer a trade on your turn");
        var tr = { from: pi, to: a.to, gc: a.gc | 0, tc: a.tc | 0, gp: (a.gp || []).slice(), tp: (a.tp || []).slice() };
        checkTrade(s, tr); s.trade = tr;
        log(s, pi, p.name + ' offered ' + nm(s, tr.to) + ' a trade.'); break;
      case 'accept':
        need(s.trade && s.trade.to === pi, 'No trade to accept');
        var q = s.trade; checkTrade(s, q);
        var A = s.players[q.from], B = s.players[q.to];
        if (q.gc) xfer(s, q.from, q.to, q.gc);
        if (q.tc) xfer(s, q.to, q.from, q.tc);
        q.gp.forEach(function (j) { s.own[j] = { o: q.to, h: 0 }; });
        q.tp.forEach(function (j) { s.own[j] = { o: q.from, h: 0 }; });
        s.trade = null; s.fx.push({ t: 'trade', a: q.from, b: q.to });
        q.tp.forEach(function (j) { if (GROUPS[T[j].g] && GROUPS[T[j].g].filter(function (x) { return q.tp.indexOf(x) >= 0; })[0] === j) setBonus(s, q.from, j); });
        q.gp.forEach(function (j) { if (GROUPS[T[j].g] && GROUPS[T[j].g].filter(function (x) { return q.gp.indexOf(x) >= 0; })[0] === j) setBonus(s, q.to, j); });
        log(s, pi, B.name + ' accepted the trade with ' + A.name + '.');
        if (s.stage === 'debt') settle(s, ctx); break;
      case 'reject':
        need(s.trade && s.trade.to === pi, 'No trade to reject');
        s.trade = null; log(s, pi, p.name + ' rejected the trade.'); break;
      case 'cancel':
        need(s.trade && s.trade.from === pi, 'No trade to cancel');
        s.trade = null; log(s, pi, p.name + ' cancelled the trade.'); break;
      case 'rush':
        need(s.rush === pi, 'No Coin Rush right now');
        var rn = 400 * Math.max(0, Math.min(15, a.n | 0)); p.coins += rn; s.rush = -1;
        s.fx.push({ t: 'coins', p: pi, n: rn });
        log(s, pi, p.name + ' grabbed ' + rn + ' coins in Coin Rush.'); break;
      case 'style':
        p.look = cleanLook(a.look); p.pet = cleanPet(a.pet); s.fx.push({ t: 'style', p: pi }); break;
      case 'gift':
        need(pi === c && s.stage !== 'auction', 'You can send coins on your turn');
        var gn = a.n | 0, gt = s.players[a.to];
        need(gt && a.to !== pi && gn >= 100 && gn <= 20000, 'Pick another player and an amount');
        gt.coins += gn; s.fx.push({ t: 'gift', from: pi, to: a.to, n: gn });
        log(s, pi, p.name + ' sent ' + gt.name + ' ' + gn + ' coins.'); break;
      case 'quit': dropOut(s, pi, ctx); break;
      case 'bankrupt':
        need(pi === c && s.stage === 'debt', 'You are not in debt');
        bankrupt(s, pi, s.debts[0].to, ctx); break;
      case 'auto':
        need((s.deadline && ctx.now >= s.deadline) || (!s.timer && a.force && pi !== c && ctx.now - (s.t || 0) >= 90000), 'The timer is still running');
        if (s.stage === 'auction' && s.auc) { log(s, s.auc.who, nm(s, s.auc.who) + ' ran out of time.'); s.fx.push({ t: 'pass', p: s.auc.who }); aucDrop(s, s.auc.who, ctx); break; }
        var who = c;
        for (var k = 0; k < 14 && s.phase === 'play' && cur(s) === who; k++) {
          if (s.trade) { s.trade = null; log(s, -1, 'The trade offer timed out.'); }
          if (s.stage === 'buy') { log(s, who, nm(s, who) + ' ran out of time and passed on ' + T[s.players[who].pos].n + '.'); s.stage = 'res'; }
          else if (s.stage === 'debt') {
            var guard = 0;
            while (s.stage === 'debt' && cur(s) === who && guard++ < 200) {
              var mine = props(s, who), hs = mine.filter(function (j) { return canSellHouse(s, who, j); });
              if (hs.length) sellHouse(s, who, hs[0]);
              else if (mine.length) sellProp(s, who, mine.filter(function (j) { return groupClear(s, j); })[0]);
              else { bankrupt(s, who, s.debts[0].to, ctx); break; }
              if (s.players[who].cash >= s.debts[0].a || !props(s, who).length) settle(s, ctx);
            }
          }
          else if (s.stage === 'roll') rollCore(s, ctx);
          else if (s.stage === 'act') { endTurn(s, ctx); break; }
          finish(s);
        }
        break;
      default: need(false, 'Unknown action');
    }
    finish(s);
    return s;
  }

  var E = { T: T, HC: HC, GN: GN, GROUPS: GROUPS, DECKN: DECKN, newRoom: newRoom, join: join, leave: leave, restyle: restyle, again: again, start: start, act: act, cur: cur, owner: owner, lvl: lvl, rent: rent,
    props: props, worth: worth, ownsGroup: ownsGroup, canBuild: canBuild, canSellHouse: canSellHouse, canSellProp: canSellProp, tradeable: tradeable, isProp: isProp, debtTotal: debtTotal, setOf: setOf };
  root.Engine = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
