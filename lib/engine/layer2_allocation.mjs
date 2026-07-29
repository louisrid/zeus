// Layer 2 · intra-team allocation (01 §3.2) + promoted-club shrinkage priors (01 §3.9).
// Every prior in here is DERIVED from the data passed in. There are no hard-coded rate constants:
// positional priors, penalty award rates and conversion rates are all computed from the archive,
// and if the archive cannot support a quantity the function returns null rather than inventing one.

/* Positional npxG-share priors, computed from the supplied squads. pi_pos = mean within-team
   share for that position across all teams with usable data. */
export function positionalSharePriors(teams) {
  const acc = {};
  for (const team of teams) {
    const total = team.players.reduce((s, p) => s + Math.max(0, p.npxg90 || 0), 0);
    if (total <= 0) continue;
    for (const p of team.players) {
      const share = Math.max(0, p.npxg90 || 0) / total;
      if (!acc[p.position]) acc[p.position] = { sum: 0, n: 0 };
      acc[p.position].sum += share;
      acc[p.position].n += 1;
    }
  }
  const out = {};
  for (const pos of Object.keys(acc)) out[pos] = acc[pos].n ? acc[pos].sum / acc[pos].n : 0;
  return out;
}

/* Empirical-Bayes shrinkage of a raw share toward its positional prior.
   m = 90s played in the window; kPos is a calibration constant supplied by the caller. */
export function shrinkShare(rawShare, ninetiesPlayed, prior, kPos) {
  const m = Math.max(0, ninetiesPlayed || 0);
  if (prior === undefined || prior === null) return rawShare;
  return (m * rawShare + kPos * prior) / (m + kPos);
}

/* Finishing-skill multiplier on scoring probability: 1 + w*r, w = shots/(shots+K),
   clamped to the calibrated bound. Both K and the clamp are inputs, not literals. */
export function finishingMultiplier(goals, xg, shots, K, clamp) {
  if (!xg || xg <= 0 || !shots) return 1;
  const r = (goals - xg) / xg;
  const w = shots / (shots + K);
  const mult = 1 + w * r;
  return Math.min(1 + clamp, Math.max(1 - clamp, mult));
}

/* Promoted-club prior blend weight: 1.0 at GW1 decaying linearly to 0 by decayToGw (01 §3.9). */
export function promotedBlendWeight(gw, decayToGw) {
  if (!decayToGw || decayToGw <= 1) return 0;
  if (gw >= decayToGw) return 0;
  return Math.max(0, Math.min(1, (decayToGw - gw) / (decayToGw - 1)));
}

/* Penalty award rate per team per match, derived from the archive.
   Returns null when the archive carries no penalty attempts at all. */
export function penaltyAwardRate(archiveRows) {
  let attempts = 0;
  const fixtures = new Set();
  for (const r of archiveRows) {
    attempts += r.pens_taken || 0;
    if (r.fixture_id) fixtures.add(`${r.fixture_id}:${r.team_id}`);
  }
  if (!fixtures.size || attempts === 0) return null;
  return attempts / fixtures.size;
}

/* League penalty conversion, shrunk toward the player's own record by attempt count. */
/* The long-run Premier League penalty conversion rate. Roughly four in five are scored and it has barely
   moved in twenty years, so it is a far better starting point than nothing.
   Returning null when the archive carried no penalty data meant every penalty taker in the league was priced
   as if he never took one. Haaland takes City's penalties, and that alone is a few tenths of a point a match
   for a striker, which is exactly the kind of gap that made premium forwards read low. */
const LEAGUE_PENALTY_CONVERSION = 0.79;

export function penaltyConversion(playerScored, playerTaken, leagueScored, leagueTaken, kAttempts) {
  if (!leagueTaken) {
    /* No league data. Use his own record if he has one, otherwise the long-run rate. */
    const taken = playerTaken || 0;
    if (!taken) return LEAGUE_PENALTY_CONVERSION;
    const own = playerScored / taken;
    const w = taken / (taken + (kAttempts || 5));
    return w * own + (1 - w) * LEAGUE_PENALTY_CONVERSION;
  }
  const league = leagueScored / leagueTaken;
  const taken = playerTaken || 0;
  if (!taken) return league;
  const own = playerScored / taken;
  const w = taken / (taken + kAttempts);
  return w * own + (1 - w) * league;
}

/* Build the full allocation profile for one team in one fixture.
   team.players carry per-90 rates; lambda is that team's implied goals for the fixture. */
export function allocateTeam({ team, lambda, priors, cfg, gw, promotedPrior }) {
  const players = team.players;
  /* A TEAMMATE WITH NO HISTORY IS UNMEASURED, NOT HARMLESS.
   *
   * On a promoted club almost nobody has a Premier League record, so treating a missing rate as zero left
   * two or three players holding the entire team's attacking threat. Measured on the 2026-27 GW1 preview:
   * Issa Diop, a centre-back, was allocated 28% of Ipswich's goals and projected 9.3 points, top of the
   * whole league. A player without a full match of history is priced at the league's average rate for his
   * position (cfg.leagueRates, derived from the archive by deriveLeagueRates), so shares stay honest. */
  const rate = (p, field) => {
    const own = Math.max(0, p[field] || 0);
    if ((p.nineties || 0) >= 1) return own;
    return cfg.leagueRates?.[field]?.[p.position] ?? own;
  };
  const rawTotal = players.reduce((s, p) => s + rate(p, "npxg90"), 0);
  const assistTotal = players.reduce((s, p) => s + rate(p, "xa90"), 0);

  const blend = team.promoted ? promotedBlendWeight(gw, cfg.promotedDecayToGw) : 0;

  /* ASSISTS WERE SHRUNK TOWARD A GOAL PRIOR, and that is why midfielders came out 23% short.
   *
   * The positional prior is built from expected GOALS, which is right for goal shares. Assist shares were
   * shrunk toward the same prior, so under heavy shrinkage (kPos was tuned to 20) every forward's assist
   * share was dragged up toward his goal share and every midfielder's dragged down. Measured on 2025-26:
   * midfield assists 23% under, forward assists 22% over. Assist shares now shrink toward an assist prior
   * built the same way from the team's own xA, and the imbalance closes. */
  const assistPriorAcc = {};
  if (assistTotal > 0) {
    for (const p of players) {
      const sh = rate(p, "xa90") / assistTotal;
      assistPriorAcc[p.position] ??= { sum: 0, n: 0 };
      assistPriorAcc[p.position].sum += sh;
      assistPriorAcc[p.position].n += 1;
    }
  }
  const assistPriors = {};
  for (const pos of Object.keys(assistPriorAcc)) assistPriors[pos] = assistPriorAcc[pos].sum / assistPriorAcc[pos].n;

  const out = players.map((p) => {
    const rawShare = rawTotal > 0 ? rate(p, "npxg90") / rawTotal : 0;
    const prior = priors[p.position] ?? 0;
    let goalShare = shrinkShare(rawShare, p.nineties, prior, cfg.kPos);
    let assistShare = assistTotal > 0
      ? shrinkShare(rate(p, "xa90") / assistTotal, p.nineties, assistPriors[p.position] ?? prior, cfg.kPos)
      : 0;
    /* On top of the corrected prior, xA itself slightly undersells real forward assists (flick-ons and lay-offs
       xA does not see). The weight is the archive's own ratio of actual assist share to xA share per position,
       derived walk-forward by deriveAssistWeights; null until 50 assists exist. Shares are re-normalised after,
       so the team's total is unchanged. */
    if (cfg.assistWeight?.[p.position]) assistShare *= cfg.assistWeight[p.position];

    // Promoted-club players: blend toward the position/price-band prior fitted on prior cohorts.
    if (blend > 0 && promotedPrior) {
      const pp = promotedPrior[p.position];
      if (pp !== undefined) {
        goalShare = (1 - blend) * goalShare + blend * pp;
        assistShare = (1 - blend) * assistShare + blend * pp;
      }
    }

    const finishing = finishingMultiplier(p.goals, p.xg, p.shots, cfg.finishingK, cfg.finishingClamp);
    /* THE DEFENSIVE RATES WERE TRUSTED RAW, AND SEVEN STARTS IS NOT A SEASON.
     *
     * Goal and assist shares are shrunk toward their priors, but the clearance and recovery rates that drive
     * defensive-contribution points and the bonus race went into the simulation exactly as sampled. A player
     * with seven strong starts (Barkley: 4.9 points a start on 7 starts, mostly defensive work) was priced as
     * if that rate were proven, and landed in the GW1 top ten. Same shrinkage, same tuned constant, toward the
     * league positional rate: 7 matches of evidence now gets about a quarter of the say, 28 gets nearly 60%. */
    const shrinkRate90 = (own, mean) => {
      if (mean === undefined || mean === null) return own;
      const m = Math.max(0, p.nineties || 0);
      return (m * Math.max(0, own || 0) + cfg.kPos * mean) / (m + cfg.kPos);
    };
    const cbit90 = shrinkRate90(p.cbit90, cfg.leagueRates?.cbit90?.[p.position]);
    const recoveries90 = shrinkRate90(p.recoveries90, cfg.leagueRates?.recoveries90?.[p.position]);
    return { ...p, cbit90, recoveries90, goalShare, assistShare, finishing, prior_blend: blend };
  });

  // Renormalise within the squad so shares sum to 1 before minutes weighting.
  const gSum = out.reduce((s, p) => s + p.goalShare, 0);
  const aSum = out.reduce((s, p) => s + p.assistShare, 0);
  for (const p of out) {
    p.goalShare = gSum > 0 ? p.goalShare / gSum : 0;
    p.assistShare = aSum > 0 ? p.assistShare / aSum : 0;
  }
  return { players: out, lambda, promotedBlend: blend };
}

/* HOW MUCH EACH POSITION'S xA UNDERSELLS OR OVERSELLS ITS REAL ASSISTS.
 *
 * The weight for a position is its share of the league's actual assists divided by its share of the league's
 * xA, measured on archive rows the caller is allowed to see. Applied to assist shares before normalisation,
 * so the team's total assists are untouched; only who gets them moves. Below 50 assists in the sample the
 * measurement is noise and no weight is returned. */
export function deriveAssistWeights(rows) {
  const g = {};
  let assistsAll = 0, xaAll = 0;
  for (const r of rows) {
    if ((Number(r.minutes) || 0) <= 0) continue;
    const pos = r.position;
    if (!["GKP", "DEF", "MID", "FWD"].includes(pos)) continue;
    g[pos] ??= { assists: 0, xa: 0 };
    g[pos].assists += Number(r.assists) || 0;
    g[pos].xa += Number(r.xa) || 0;
    assistsAll += Number(r.assists) || 0;
    xaAll += Number(r.xa) || 0;
  }
  if (assistsAll < 50 || !(xaAll > 0)) return null;
  const out = {};
  for (const [pos, v] of Object.entries(g)) {
    if (!(v.xa > 0)) continue;
    out[pos] = (v.assists / assistsAll) / (v.xa / xaAll);
  }
  return out;
}

/* League per-90 rates by position, minutes-weighted, from archive rows the caller may see.
   Used to price a player with no history at his position's average threat rather than zero. */
export function deriveLeagueRates(rows) {
  const g = {};
  for (const r of rows) {
    const min = Number(r.minutes) || 0;
    if (min <= 0) continue;
    const pos = r.position;
    if (!["GKP", "DEF", "MID", "FWD"].includes(pos)) continue;
    g[pos] ??= { min: 0, xg: 0, xa: 0, cbit: 0, rec: 0 };
    g[pos].min += min;
    g[pos].xg += Number(r.xg) || 0;
    g[pos].xa += Number(r.xa) || 0;
    g[pos].cbit += Number(r.cbit) || 0;
    g[pos].rec += Number(r.recoveries) || 0;
  }
  const npxg90 = {}, xa90 = {}, cbit90 = {}, recoveries90 = {};
  for (const [pos, v] of Object.entries(g)) {
    if (v.min < 900) continue;
    npxg90[pos] = v.xg / (v.min / 90);
    xa90[pos] = v.xa / (v.min / 90);
    cbit90[pos] = v.cbit / (v.min / 90);
    recoveries90[pos] = v.rec / (v.min / 90);
  }
  return { npxg90, xa90, cbit90, recoveries90 };
}
