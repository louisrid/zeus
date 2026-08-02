/* OPTIMISE: get the most out of the fifteen you already have.
 *
 * It never adds or removes a player. It chooses the legal eleven with the highest total, orders the bench by
 * who you would most want coming on, and picks the captain and vice. That is a different job from BUILD,
 * which changes the squad, and it is the one you run every week once the squad is settled.
 */
/* No imports on purpose. The rules live in a JSON file, and importing JSON needs an attribute in Node that
   webpack rejects, which has already cost a broken page once. The caller passes the shapes in. */
const LEGAL = [
  ["3-4-3", { GKP: 1, DEF: 3, MID: 4, FWD: 3 }], ["3-5-2", { GKP: 1, DEF: 3, MID: 5, FWD: 2 }],
  ["4-3-3", { GKP: 1, DEF: 4, MID: 3, FWD: 3 }], ["4-4-2", { GKP: 1, DEF: 4, MID: 4, FWD: 2 }],
  ["4-5-1", { GKP: 1, DEF: 4, MID: 5, FWD: 1 }], ["5-2-3", { GKP: 1, DEF: 5, MID: 2, FWD: 3 }],
  ["5-3-2", { GKP: 1, DEF: 5, MID: 3, FWD: 2 }], ["5-4-1", { GKP: 1, DEF: 5, MID: 4, FWD: 1 }],
];
const STARTING_XI = 11;

/* Every legal shape, scored on the best eleven the squad can field in it. */
export function optimiseSquad(squad, xpOf, opts = {}) {
  const players = (squad.players || []).filter(Boolean);
  if (players.length < STARTING_XI) return null;

  const xp = (p) => { const v = xpOf(p); return Number.isFinite(Number(v)) ? Number(v) : 0; };
  const byPos = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) if (byPos[p.position]) byPos[p.position].push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => xp(b) - xp(a));

  const shapes = opts.onlyFormation ? LEGAL.filter(([k]) => k === opts.onlyFormation) : LEGAL;
  let best = null;
  for (const [key, st] of shapes) {
    // A shape is only available if the squad actually holds enough of each position.
    if (["GKP", "DEF", "MID", "FWD"].some((pos) => byPos[pos].length < st[pos])) continue;
    const xi = ["GKP", "DEF", "MID", "FWD"].flatMap((pos) => byPos[pos].slice(0, st[pos]));
    const total = xi.reduce((a, p) => a + xp(p), 0);
    if (!best || total > best.total) best = { total, xi, shape: key, st };
  }
  if (!best) return null;

  const inXi = new Set(best.xi.map((p) => p.fpl_id));
  const rest = players.filter((p) => !inXi.has(p.fpl_id));

  /* Bench order. The reserve keeper is fixed at the front because he can only replace the keeper, so he is
     never a useful early substitute. The outfield reserves follow by projection: the one you would most
     want coming on goes first. */
  const benchKeeper = rest.filter((p) => p.position === "GKP");
  const benchOutfield = rest.filter((p) => p.position !== "GKP").sort((a, b) => xp(b) - xp(a));
  const bench = [...benchKeeper, ...benchOutfield];

  /* Captain: the highest projection in the eleven, since the armband doubles it. Vice: the next highest,
     and never the same player, so a late withdrawal still leaves a doubled score. */
  const ranked = [...best.xi].sort((a, b) => xp(b) - xp(a));
  const captain = ranked[0] || null;
  const vice = ranked.find((p) => !captain || p.fpl_id !== captain.fpl_id) || null;

  return {
    structure: best.shape,
    players: [
      ...best.xi.map((p) => ({ ...p, starting: true })),
      ...bench.map((p) => ({ ...p, starting: false })),
    ],
    captain: captain ? captain.fpl_id : null,
    vice: vice ? vice.fpl_id : null,
    xp: Math.round((best.total + (captain ? xp(captain) : 0)) * 10) / 10,
    changed: {
      formation: best.shape !== squad.structure,
      xi: [...inXi].some((id) => !players.find((p) => p.fpl_id === id && p.starting)),
      captain: (captain ? captain.fpl_id : null) !== (squad.captain ?? null),
    },
  };
}

/* THE BENCH BOOST SQUAD: maximise the total across ALL FIFTEEN.
 *
 * This is a different problem from picking a squad, and reusing the ordinary builder does not solve it. That
 * builder spends the budget on the eleven and fills the bench with the cheapest legal bodies, because a bench
 * normally scores nothing. Ask it for a bench boost squad and it hands back the same squad, which is exactly
 * what the first attempt did: a gain of zero.
 *
 * Under the chip every player scores, so formation is irrelevant to the total and the question becomes
 * simpler: fifteen players, the legal composition, inside the budget and the club limit, with the highest
 * sum. Greedy on points per pound to fill the quotas, then repeatedly take the single best affordable swap
 * until none improves it.
 */
const COMPOSITION = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };

export function bestFifteenAllPlaying({ pool, xpOf, budget = 100, maxPerClub = 3, startProbOf = null, minStart = 0.55, seed = null }) {
  const xp = (p) => { const v = xpOf(p); return Number.isFinite(Number(v)) ? Number(v) : 0; };
  const price = (p) => Number(p.price);

  const eligible = (pool || []).filter((p) => {
    if (!Number.isFinite(price(p)) || price(p) <= 0) return false;
    if (!COMPOSITION[p.position]) return false;
    if (!startProbOf) return true;
    const s = startProbOf(p);
    // Unknown means unknown. Only a probability we KNOW is low disqualifies anyone.
    return s === null || s === undefined ? true : s >= minStart;
  });
  if (eligible.length < 15) return null;

  const byPos = {};
  for (const pos of Object.keys(COMPOSITION)) {
    byPos[pos] = eligible.filter((p) => p.position === pos).sort((a, b) => xp(b) - xp(a));
    if (byPos[pos].length < COMPOSITION[pos]) return null;
  }

  const chosen = [];
  const clubCount = new Map();
  const spend = () => chosen.reduce((a, p) => a + price(p), 0);
  const roomAt = (p) => (clubCount.get(p.team_id) || 0) < maxPerClub;
  const take = (p) => { chosen.push(p); clubCount.set(p.team_id, (clubCount.get(p.team_id) || 0) + 1); };
  const drop = (p) => {
    chosen.splice(chosen.indexOf(p), 1);
    clubCount.set(p.team_id, Math.max(0, (clubCount.get(p.team_id) || 0) - 1));
  };

  /* SEEDING MATTERS MORE THAN THE SWAPS.
   *
   * Filling from the cheapest and improving by single swaps sounds reasonable and lands in a poor local
   * optimum: the first big gain eats the budget and the remaining slots can never be upgraded. Measured, that
   * produced a fifteen WORSE than an ordinary squad, which is nonsense for a chip meant to add points.
   *
   * So start from several places and keep the best ending. One of the seeds is any squad handed in by the
   * caller, which means this can never return something worse than the squad it was given. */
  const seedFrom = (list) => {
    chosen.length = 0; clubCount.clear();
    for (const p of list) take(p);
  };
  const cheapestFill = () => {
    const out = [];
    const count = new Map();
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
      const cheap = [...byPos[pos]].sort((a, b) => price(a) - price(b));
      let filled = 0;
      for (const p of cheap) {
        if (filled >= COMPOSITION[pos]) break;
        if ((count.get(p.team_id) || 0) >= maxPerClub) continue;
        out.push(p); count.set(p.team_id, (count.get(p.team_id) || 0) + 1); filled++;
      }
      if (filled < COMPOSITION[pos]) return null;
    }
    return out;
  };

  const seeds = [];
  const cheap = cheapestFill();
  if (cheap) seeds.push(cheap);
  if (Array.isArray(seed) && seed.length === 15) {
    const comp = {};
    for (const p of seed) comp[p.position] = (comp[p.position] || 0) + 1;
    const legal = Object.keys(COMPOSITION).every((k) => comp[k] === COMPOSITION[k]);
    if (legal) seeds.push(seed);
  }
  if (!seeds.length) return null;

  /* Improve by single swaps, twice over: first buying the best value per pound so the budget goes far, then
     the biggest raw gain to spend whatever is left. Either order alone gets stuck. */
  const improve = (byValue) => {
    let guard = 800;
    while (guard-- > 0) {
      const spare = budget - spend();
      const owned = new Set(chosen.map((p) => p.fpl_id));
      let best = null;
      for (const out of chosen) {
        for (const inp of byPos[out.position]) {
          if (owned.has(inp.fpl_id)) continue;
          const extra = price(inp) - price(out);
          if (extra > spare + 1e-9) continue;
          if (inp.team_id !== out.team_id && (clubCount.get(inp.team_id) || 0) >= maxPerClub) continue;
          const gain = xp(inp) - xp(out);
          if (gain <= 1e-9) continue;
          const rank = byValue ? (extra > 0 ? gain / extra : gain * 1000) : gain;
          if (!best || rank > best.rank) best = { out, inp, rank };
        }
      }
      if (!best) break;
      drop(best.out); take(best.inp);
    }
  };

  let winner = null;
  for (const s0 of seeds) {
    seedFrom(s0);
    if (spend() > budget) continue;
    improve(true);
    improve(false);
    const t = chosen.reduce((a, p) => a + xp(p), 0);
    if (!winner || t > winner.total) winner = { total: t, players: [...chosen], spend: spend() };
  }
  if (!winner) return null;
  chosen.length = 0; clubCount.clear();
  for (const p of winner.players) take(p);

  const total = chosen.reduce((a, p) => a + xp(p), 0);
  const ranked = [...chosen].sort((a, b) => xp(b) - xp(a));
  return {
    players: chosen,
    total: Math.round(total * 10) / 10,
    spend: Math.round(spend() * 10) / 10,
    captain: ranked[0] ? ranked[0].fpl_id : null,
    vice: ranked[1] ? ranked[1].fpl_id : null,
  };
}
