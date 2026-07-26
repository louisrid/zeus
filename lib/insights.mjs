/* THINGS WORTH NOTICING.
 *
 * From the original brief: "a page dedicated to things the AI has noticed. For example, Arsenal are
 * conceding a lot more goals than they were at the same point last year, Isak is not on penalties as
 * expected, or Saka has not scored or assisted for my team yet despite costing £10 million."
 *
 * Every observation below is derived from data already in the database. Nothing is generated prose and
 * nothing is asserted without the numbers behind it: each insight carries the figures that produced it,
 * so it can be disagreed with.
 *
 * An observation that needs in-season data returns nothing before GW1 rather than a hedge.
 */

const round1 = (v) => Math.round(v * 10) / 10;

/* A premium who is not on penalties. Penalty duty is derived from history, so this is evidence-based
   rather than assumed, and it is the single most common mispricing of an expensive forward. */
export function premiumsWithoutPenalties(pool, penaltyTakerIds, { minPrice = 8.5, limit = 6 } = {}) {
  if (!pool || !penaltyTakerIds) return [];
  const takers = new Set(penaltyTakerIds);
  return pool
    .filter((p) => Number(p.price) >= minPrice && (p.position === "FWD" || p.position === "MID") && !takers.has(p.fpl_id))
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, limit)
    .map((p) => ({
      kind: "no_penalties",
      player: p,
      headline: `${p.web_name} costs ${round1(Number(p.price))} and is not on penalties`,
      detail: `No missed penalty on record across four seasons, which is the only evidence the open data gives of duty. Duty may still have moved this summer.`,
    }));
}

/* The market disagreeing with the model, in both directions. This is X£ made specific. */
export function mispriced(pool, xprice, { limit = 5 } = {}) {
  if (!pool || !xprice) return [];
  const rows = pool.map((p) => ({ p, x: xprice.of(p) })).filter((r) => r.x);
  const under = rows.filter((r) => r.x.verdict === "under").sort((a, b) => b.x.gap - a.x.gap).slice(0, limit);
  const over = rows.filter((r) => r.x.verdict === "over").sort((a, b) => a.x.gap - b.x.gap).slice(0, limit);
  return [
    ...under.map(({ p, x }) => ({
      kind: "underpriced", player: p,
      headline: `${p.web_name} looks ${round1(x.gap)} cheap`,
      detail: `Costs ${round1(Number(p.price))}, worth ${x.xprice} at what the market charges per point for a ${p.position}.`,
    })),
    ...over.map(({ p, x }) => ({
      kind: "overpriced", player: p,
      headline: `${p.web_name} looks ${round1(Math.abs(x.gap))} expensive`,
      detail: `Costs ${round1(Number(p.price))}, worth ${x.xprice} at his position's rate.`,
    })),
  ];
}

/* Heavily owned players the model does not rate. Owning one is a rank risk in both directions: if the
   field is right you have missed nothing, if the model is right the field is carrying dead weight. */
export function ownedButNotRated(pool, scoreOf, { minOwn = 25, limit = 5 } = {}) {
  if (!pool || !scoreOf) return [];
  const byPos = {};
  for (const p of pool) {
    if (!byPos[p.position]) byPos[p.position] = [];
    byPos[p.position].push(p);
  }
  const median = {};
  for (const [pos, list] of Object.entries(byPos)) {
    const scores = list.map(scoreOf).filter(Number.isFinite).sort((a, b) => a - b);
    if (scores.length) median[pos] = scores[Math.floor(scores.length / 2)];
  }
  return pool
    .filter((p) => Number(p.own) >= minOwn && Number.isFinite(scoreOf(p)) && median[p.position] !== undefined
      && scoreOf(p) < median[p.position])
    .sort((a, b) => Number(b.own) - Number(a.own))
    .slice(0, limit)
    .map((p) => ({
      kind: "owned_not_rated", player: p,
      headline: `${p.web_name} is owned by ${round1(Number(p.own))}% and scores below his position's midpoint`,
      detail: `Projected ${round1(scoreOf(p))} against a ${p.position} midpoint of ${round1(median[p.position])}.`,
    }));
}

/* Who to own for a fixture swing. The brief asked for the runs and the players, and the runs alone are
   only half an answer. */
export function swingTargets(swings, pool, scoreOf, { perTeam = 3 } = {}) {
  if (!swings || !swings.easing || !pool || !scoreOf) return [];
  return swings.easing.map((run) => ({
    team: run.team,
    difficulty: run.avg,
    players: pool
      .filter((p) => p.team === run.team && Number.isFinite(scoreOf(p)))
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, perTeam),
  })).filter((r) => r.players.length);
}

/* An availability flag on someone the field still owns heavily. */
export function riskyButOwned(pool, { minOwn = 15, limit = 5 } = {}) {
  if (!pool) return [];
  return pool
    .filter((p) => Number(p.own) >= minOwn
      && ((p.status && p.status !== "a") || (p.chance_of_playing !== null && p.chance_of_playing !== undefined && p.chance_of_playing < 100)))
    .sort((a, b) => Number(b.own) - Number(a.own))
    .slice(0, limit)
    .map((p) => ({
      kind: "risky_but_owned", player: p,
      headline: `${p.web_name} is flagged and still owned by ${round1(Number(p.own))}%`,
      detail: p.news || `Chance of playing ${p.chance_of_playing === null ? "unknown" : p.chance_of_playing + "%"}.`,
    }));
}

/* Everything, ordered so the sharpest observations lead. */
export function buildInsights({ pool, scoreOf, xprice, penaltyTakerIds, swings }) {
  const out = [
    ...riskyButOwned(pool || []),
    ...premiumsWithoutPenalties(pool || [], penaltyTakerIds || []),
    ...mispriced(pool || [], xprice),
    ...ownedButNotRated(pool || [], scoreOf),
  ];
  return { insights: out, swingTargets: swingTargets(swings, pool, scoreOf) };
}
