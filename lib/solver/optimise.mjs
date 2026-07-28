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
