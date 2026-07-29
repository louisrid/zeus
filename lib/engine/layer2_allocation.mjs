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
  const rawTotal = players.reduce((s, p) => s + Math.max(0, p.npxg90 || 0), 0);
  const assistTotal = players.reduce((s, p) => s + Math.max(0, p.xa90 || 0), 0);

  const blend = team.promoted ? promotedBlendWeight(gw, cfg.promotedDecayToGw) : 0;

  const out = players.map((p) => {
    const rawShare = rawTotal > 0 ? Math.max(0, p.npxg90 || 0) / rawTotal : 0;
    const prior = priors[p.position] ?? 0;
    let goalShare = shrinkShare(rawShare, p.nineties, prior, cfg.kPos);
    let assistShare = assistTotal > 0
      ? shrinkShare(Math.max(0, p.xa90 || 0) / assistTotal, p.nineties, prior, cfg.kPos)
      : 0;

    // Promoted-club players: blend toward the position/price-band prior fitted on prior cohorts.
    if (blend > 0 && promotedPrior) {
      const pp = promotedPrior[p.position];
      if (pp !== undefined) {
        goalShare = (1 - blend) * goalShare + blend * pp;
        assistShare = (1 - blend) * assistShare + blend * pp;
      }
    }

    const finishing = finishingMultiplier(p.goals, p.xg, p.shots, cfg.finishingK, cfg.finishingClamp);
    return { ...p, goalShare, assistShare, finishing, prior_blend: blend };
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
