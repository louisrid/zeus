// Layer 0 · market-implied team goals (01 §3.0).
// One code path for both sources: live Odds API rows and football-data.co.uk closing lines
// arrive as the same {h, d, a, over25, under25} shape and are solved identically.

import { scorelineGrid, gridMarkets } from "./layer1_scoreline.mjs";

/* Power-method de-overround: find k with sum((1/o_i)^k) = 1.
   Falls back to proportional normalisation if the bisection cannot bracket, and the method
   actually used is returned so it can be stored on the snapshot. */
export function deoverround(odds, tol = 1e-8) {
  const inv = odds.map((o) => 1 / o);
  const sum = inv.reduce((s, x) => s + x, 0);
  const f = (k) => inv.reduce((s, x) => s + Math.pow(x, k), 0) - 1;
  let lo = 0.5;
  let hi = 2.0;
  if (f(lo) * f(hi) > 0) {
    return { probs: inv.map((x) => x / sum), method: "proportional" };
  }
  // f is decreasing in k for odds > 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = f(mid);
    if (Math.abs(v) < tol) {
      lo = mid;
      hi = mid;
      break;
    }
    if (v > 0) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  const probs = inv.map((x) => Math.pow(x, k));
  const total = probs.reduce((s, x) => s + x, 0);
  return { probs: probs.map((p) => p / total), method: "power", k };
}

/* Two-outcome totals line, de-overrounded proportionally per 01 §3.0 step 2. */
export function overProbability(over25, under25) {
  if (!over25 || !under25) return null;
  const io = 1 / over25;
  const iu = 1 / under25;
  return io / (io + iu);
}

/* Weighted squared error between the DC grid's market summaries and the de-overrounded market. */
function fitError(lh, la, rho, target) {
  const { grid } = scorelineGrid(lh, la, rho);
  const m = gridMarkets(grid);
  let err = (m.pH - target.pH) ** 2 + (m.pD - target.pD) ** 2 + (m.pA - target.pA) ** 2;
  if (target.over25 !== null && target.over25 !== undefined) err += (m.over25 - target.over25) ** 2;
  return err;
}

/* Initialise the total from the over/under line, then split by the win-probability ratio
   (01 §3.0 step 3). Deterministic and dependency-free: coarse grid then local refinement,
   standing in for L-BFGS-B on a two-parameter surface that is smooth and unimodal here. */
function initialTotal(target) {
  if (target.over25 === null || target.over25 === undefined) return 2.7;
  let best = 2.7;
  let bestErr = Infinity;
  for (let m = 1.2; m <= 5.0; m += 0.02) {
    const pOver = 1 - (poisAt(0, m) + poisAt(1, m) + poisAt(2, m));
    const err = Math.abs(pOver - target.over25);
    if (err < bestErr) {
      bestErr = err;
      best = m;
    }
  }
  return best;
}
function poisAt(k, l) {
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-l + k * Math.log(l) - logFact);
}

export function solveLambdas(target, rho) {
  const total0 = initialTotal(target);
  const ratio = target.pH + target.pA > 0 ? target.pH / (target.pH + target.pA) : 0.5;
  let bestLh = total0 * Math.min(0.8, Math.max(0.2, ratio));
  let bestLa = total0 - bestLh;
  let bestErr = fitError(bestLh, bestLa, rho, target);

  let step = 0.4;
  for (let pass = 0; pass < 7; pass++) {
    let improved = true;
    while (improved) {
      improved = false;
      const cands = [
        [bestLh + step, bestLa],
        [bestLh - step, bestLa],
        [bestLh, bestLa + step],
        [bestLh, bestLa - step],
        [bestLh + step, bestLa + step],
        [bestLh - step, bestLa - step],
        [bestLh + step, bestLa - step],
        [bestLh - step, bestLa + step],
      ];
      for (const [lh, la] of cands) {
        if (lh < 0.05 || la < 0.05 || lh > 6 || la > 6) continue;
        const err = fitError(lh, la, rho, target);
        if (err < bestErr - 1e-12) {
          bestErr = err;
          bestLh = lh;
          bestLa = la;
          improved = true;
        }
      }
    }
    step /= 3;
  }
  return {
    lambda_home: +bestLh.toFixed(4),
    lambda_away: +bestLa.toFixed(4),
    fit_residual: +Math.sqrt(bestErr).toFixed(6),
  };
}

/* The public entry point: a raw odds row in, implied goal environment out. */
export function impliedGoalEnvironment(snapshot, rho) {
  const { h, d, a, over25, under25 } = snapshot;
  if (!h || !d || !a) return null;
  const { probs, method } = deoverround([h, d, a]);
  const target = {
    pH: probs[0],
    pD: probs[1],
    pA: probs[2],
    over25: overProbability(over25, under25),
  };
  const solved = solveLambdas(target, rho);
  return {
    ...solved,
    deoverround_method: method + "+dc",
    market: target,
  };
}

/* Fallback goal environment when no odds row exists for a fixture: FPL team strength ratios
   scaled to the league's own mean goals. Every value is derived from the supplied data —
   nothing invented — and the caller labels the projection as odds-free. */
export function fallbackGoalEnvironment(homeStrength, awayStrength, leagueMeanGoals, homeAdvantage) {
  if (!leagueMeanGoals || !homeStrength || !awayStrength) return null;
  const ratio = homeStrength / awayStrength;

  /* THE TOTAL MOVES WITH THE MISMATCH. IT USED NOT TO.
   *
   * This forced every fixture to exactly the league average, then split it by strength. So Manchester City at
   * home to Bournemouth priced at 1.84 goals for City, when a bookmaker would say about 2.4. Haaland came out
   * at 6.4 for that fixture instead of the 8 or 9 it deserves, and every premium attacker in a soft fixture
   * was capped the same way. Meanwhile a bad side against a good one had its goals inflated to fill the fixed
   * total. That single line was the reason the top of the projection list looked squashed.
   *
   * A strong side against a weak one produces MORE goals than an average match, not the same: the favourite
   * scores freely without the underdog scoring less than they otherwise would. Total goals therefore rise with
   * the mismatch. The lift is modest and bounded, because even a huge gap does not double a scoreline: at the
   * most lopsided fixture in a season it adds roughly a quarter, which is what the odds show.
   */
  const gap = Math.abs(Math.log(ratio));               // symmetric: a mismatch either way lifts the total
  const lift = 1 + Math.min(0.26, gap * 0.30);
  const total = leagueMeanGoals * lift;

  const share = Math.min(0.78, Math.max(0.22, (ratio * homeAdvantage) / (1 + ratio * homeAdvantage)));
  return {
    lambda_home: +(total * share).toFixed(4),
    lambda_away: +(total * (1 - share)).toFixed(4),
    fit_residual: null,
    deoverround_method: "team-strength-fallback",
  };
}

const positiveFinite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const meanPositive = (rows, field) => {
  const values = (rows || []).map((row) => positiveFinite(row?.[field])).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};

function goalEnvironmentFromPowers(homePower, awayPower, leagueMeanGoals, method) {
  const ratio = homePower / awayPower;
  const gap = Math.abs(Math.log(ratio));
  const lift = 1 + Math.min(0.26, gap * 0.30);
  const total = leagueMeanGoals * lift;
  const share = Math.min(0.78, Math.max(0.22, homePower / (homePower + awayPower)));
  return {
    lambda_home: +(total * share).toFixed(4),
    lambda_away: +(total * (1 - share)).toFixed(4),
    fit_residual: null,
    deoverround_method: method,
  };
}

/* Complete odds-free fixture environment.

   The old projection job passed only teams.strength into fallbackGoalEnvironment. During preseason that
   field can be zero or missing even while FPL's venue-specific attack and defence ratings are populated.
   The helper then returned null and the fixture loop silently skipped every future match without odds.

   Preference order:
   1. overall FPL strength, preserving the established fallback exactly;
   2. venue-specific attack/defence ratings, normalised to the current league;
   3. a neutral league environment with the measured/preseason home split.

   A valid league mean therefore always produces lambdas. Missing team records remain a caller error and
   are not hidden here. */
export function fallbackGoalEnvironmentForTeams({
  homeTeam,
  awayTeam,
  leagueTeams = [],
  leagueMeanGoals,
  homeAdvantage = 1,
} = {}) {
  const leagueMean = positiveFinite(leagueMeanGoals);
  if (leagueMean === null) return null;

  const overallHome = positiveFinite(homeTeam?.strength);
  const overallAway = positiveFinite(awayTeam?.strength);
  if (overallHome !== null && overallAway !== null) {
    return fallbackGoalEnvironment(overallHome, overallAway, leagueMean, positiveFinite(homeAdvantage) || 1);
  }

  const homeAttack = positiveFinite(homeTeam?.strength_attack_home);
  const awayDefence = positiveFinite(awayTeam?.strength_defence_away);
  const awayAttack = positiveFinite(awayTeam?.strength_attack_away);
  const homeDefence = positiveFinite(homeTeam?.strength_defence_home);
  const meanHomeAttack = meanPositive(leagueTeams, "strength_attack_home");
  const meanAwayDefence = meanPositive(leagueTeams, "strength_defence_away");
  const meanAwayAttack = meanPositive(leagueTeams, "strength_attack_away");
  const meanHomeDefence = meanPositive(leagueTeams, "strength_defence_home");

  if ([homeAttack, awayDefence, awayAttack, homeDefence,
    meanHomeAttack, meanAwayDefence, meanAwayAttack, meanHomeDefence]
    .every((value) => value !== null)) {
    // These are already venue-specific FPL ratings, so applying home advantage again would double-count it.
    const homePower = (homeAttack / meanHomeAttack) * (meanAwayDefence / awayDefence);
    const awayPower = (awayAttack / meanAwayAttack) * (meanHomeDefence / homeDefence);
    return goalEnvironmentFromPowers(homePower, awayPower, leagueMean, "team-component-strength-fallback");
  }

  const advantage = positiveFinite(homeAdvantage) || 1;
  const homeShare = advantage / (1 + advantage);
  return {
    lambda_home: +(leagueMean * homeShare).toFixed(4),
    lambda_away: +(leagueMean * (1 - homeShare)).toFixed(4),
    fit_residual: null,
    deoverround_method: "league-neutral-fallback",
  };
}

