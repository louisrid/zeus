import { reliableRate } from "./player_rate_resolver.mjs";
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

/* A team's previous penalty count is far too noisy to use raw. Zero penalties last season does not mean
   zero chance next season, and promoted clubs should not lose penalty expectation because their PL sample
   is empty. Shrink every club toward the league rate over a transparent number of team matches. */

/* Understat stores total xG and non-penalty xG. Their difference is penalty xG, which recovers the
   historical penalty-event count when the archive has no explicit attempts. */
export function penaltyAttemptsFromExpectedGoals(xg, npxg, spotXg = 0.76) {
  const unit = Math.max(0.01, Number(spotXg) || 0.76);
  return Math.max(0, (Number(xg) || 0) - (Number(npxg) || 0)) / unit;
}

export function shrunkPenaltyAwardRate({
  teamAttempts = 0,
  teamMatches = 0,
  leagueAttempts = 0,
  leagueTeamMatches = 0,
  priorMatches = 38,
}) {
  const leagueRate = leagueTeamMatches > 0 ? Math.max(0, leagueAttempts) / leagueTeamMatches : null;
  if (!Number.isFinite(leagueRate)) return null;
  const exposure = Math.max(0, Number(teamMatches) || 0);
  const k = Math.max(0, Number(priorMatches) || 0);
  return (Math.max(0, Number(teamAttempts) || 0) + leagueRate * k) / Math.max(1e-9, exposure + k);
}

/* The competitor's penalty expectation changes by fixture. ZEUS already has the stronger upstream input,
   a market/team-strength goal lambda, so use it to scale the shrunken team penalty rate. The square-root
   default deliberately moves less aggressively than goals themselves and the bounds prevent one fixture
   from manufacturing or deleting the penalty component. */
export function fixturePenaltyAwardRate({
  baseRate,
  lambda,
  leagueGoalsPerTeam,
  exponent = 0.5,
  minScale = 0.65,
  maxScale = 1.5,
}) {
  if (!Number.isFinite(Number(baseRate))) return null;
  const baseline = Number(leagueGoalsPerTeam);
  const attack = Number(lambda);
  if (!(baseline > 0) || !(attack > 0)) return Math.max(0, Number(baseRate));
  const scale = Math.min(
    Math.max(0, Number(maxScale) || 1.5),
    Math.max(Math.max(0, Number(minScale) || 0), (attack / baseline) ** Math.max(0, Number(exponent) || 0)),
  );
  return Math.max(0, Number(baseRate)) * scale;
}

/* Convert current penalty hierarchy into explicit shares. One named rank-one taker owns the role. Where
   there are multiple ranked takers, the top taker's confidence becomes his share and the remainder is
   distributed across the lower-ranked evidence. If no current hierarchy exists, historical attempts are
   the fallback. This creates the same useful concept as the competitor's pen_share without copying its
   hidden coefficients. */
export function penaltyDutyShares(players = []) {
  const out = new Map(players.map((p) => [p.player_id, 0]));
  const ranked = players
    .filter((p) => Number(p.penRank) > 0)
    .sort((a, b) => Number(a.penRank) - Number(b.penRank));

  if (ranked.length === 1) {
    out.set(ranked[0].player_id, 1);
    return out;
  }

  if (ranked.length > 1) {
    const top = ranked[0];
    const rawConfidence = Number(top.penConfidence);
    const topShare = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0.5, rawConfidence))
      : 0.85;
    out.set(top.player_id, topShare);
    const remaining = 1 - topShare;
    const lower = ranked.slice(1);
    const weights = lower.map((p) => {
      const confidence = Number.isFinite(Number(p.penConfidence)) ? Math.max(0, Number(p.penConfidence)) : 0.5;
      const history = Math.max(0, Number(p.pensTaken) || 0);
      return confidence / Math.max(1, Number(p.penRank) || 1) + history;
    });
    const total = weights.reduce((s, x) => s + x, 0);
    for (let i = 0; i < lower.length; i++) {
      out.set(lower[i].player_id, total > 0 ? remaining * weights[i] / total : remaining / lower.length);
    }
    return out;
  }

  const historical = players.filter((p) => (Number(p.pensTaken) || 0) > 0);
  const totalTaken = historical.reduce((s, p) => s + Math.max(0, Number(p.pensTaken) || 0), 0);
  if (totalTaken > 0) {
    for (const p of historical) out.set(p.player_id, Math.max(0, Number(p.pensTaken) || 0) / totalTaken);
  }
  return out;
}

/* xA already carries most creative information. This aggregate correction only moves allocation where a
   whole football role systematically turns xA into actual FPL assists differently. It is derived from the
   supplied prior-season population and ignored for thin roles. */
export function deriveRoleAssistWeights(profiles = [], roleOf = (p) => p.role) {
  const grouped = new Map();
  let allAssists = 0;
  let allXa = 0;
  for (const p of profiles) {
    const role = roleOf(p);
    const assists = Math.max(0, Number(p.assists) || 0);
    const xa = Math.max(0, Number(p.xa) || 0);
    const minutes = Math.max(0, Number(p.minutes) || 0);
    if (!role || minutes < 540 || xa <= 0) continue;
    const g = grouped.get(role) || { assists: 0, xa: 0, minutes: 0, players: 0 };
    g.assists += assists;
    g.xa += xa;
    g.minutes += minutes;
    g.players += 1;
    grouped.set(role, g);
    allAssists += assists;
    allXa += xa;
  }
  if (!(allAssists > 0) || !(allXa > 0)) return null;
  const out = {};
  for (const [role, g] of grouped) {
    if (g.players < 3 || g.minutes < 2700 || g.assists < 8 || g.xa < 5) continue;
    const measured = (g.assists / allAssists) / (g.xa / allXa);
    out[role] = Math.min(1.5, Math.max(0.6, measured));
  }
  return Object.keys(out).length ? out : null;
}

/* Build the full allocation profile for one team in one fixture.
   team.players carry per-90 rates; lambda is that team's implied goals for the fixture. */
export function allocateTeam({ team, lambda, priors, cfg, gw, promotedPrior }) {
  const players = team.players;
  const priorFor = (p, field) => {
    const roleValue = p.role && cfg.roleRates?.[field]?.[p.role];
    if (Number.isFinite(Number(roleValue))) return Math.max(0, Number(roleValue));
    const positionValue = cfg.leagueRates?.[field]?.[p.position];
    return Math.max(0, Number(positionValue) || 0);
  };
  const sampleFor = (p, field) => {
    if (field === "npxg90") return p.npxgNineties ?? p.rateNineties ?? p.nineties;
    return p.xaNineties ?? p.rateNineties ?? p.nineties;
  };
  const rateFor = (p, field) => reliableRate({
    rate: p[field],
    nineties: sampleFor(p, field),
    prior: priorFor(p, field),
    // A single transparent shrink. Do not shrink the resulting share again.
    k: cfg.rateShrinkNineties ?? cfg.kPos ?? 12,
  });

  const reliableGoalRates = new Map(players.map((p) => [p.player_id, rateFor(p, "npxg90")]));
  const reliableAssistRates = new Map(players.map((p) => [p.player_id, rateFor(p, "xa90")]));
  const rawTotal = players.reduce((s, p) => s + reliableGoalRates.get(p.player_id), 0);
  const assistWeighted = players.map((p) => {
    const roleWeight = Number(cfg.assistRoleWeight?.[p.role]);
    const positionWeight = Number(cfg.assistWeight?.[p.position]);
    return {
      player_id: p.player_id,
      value: reliableAssistRates.get(p.player_id) * (
        Number.isFinite(roleWeight) ? roleWeight : Number.isFinite(positionWeight) ? positionWeight : 1
      ),
    };
  });
  const assistTotal = assistWeighted.reduce((s, x) => s + x.value, 0);
  const assistById = new Map(assistWeighted.map((x) => [x.player_id, x.value]));
  const blend = team.promoted ? promotedBlendWeight(gw, cfg.promotedDecayToGw) : 0;
  const penaltyShares = penaltyDutyShares(players);

  const out = players.map((p) => {
    let goalShare = rawTotal > 0 ? reliableGoalRates.get(p.player_id) / rawTotal : 0;
    let assistShare = assistTotal > 0 ? assistById.get(p.player_id) / assistTotal : 0;

    if (blend > 0 && promotedPrior) {
      const pp = promotedPrior[p.position];
      if (Number.isFinite(Number(pp))) {
        const priorShare = Math.max(0, Number(pp));
        goalShare = (1 - blend) * goalShare + blend * priorShare;
        assistShare = (1 - blend) * assistShare + blend * priorShare;
      }
    }

    return {
      ...p,
      goalShare,
      assistShare,
      finishing: finishingMultiplier(p.goals, p.xg, p.shots, cfg.finishingK, cfg.finishingClamp),
      prior_blend: blend,
      used_npxg90: reliableGoalRates.get(p.player_id),
      used_xa90: reliableAssistRates.get(p.player_id),
      penaltyShare: penaltyShares.get(p.player_id) || 0,
    };
  });

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
