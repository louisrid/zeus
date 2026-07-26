"use client";
import SCHEDULE from "../../config/schedule.js";
// The single place the tool decides what number to show for a player and what to call it.
//
// BINDING (STATUS.md, 24 Jul): the term xP appears in the UI only once the walk-forward
// Projected points are called xP everywhere, always. Louis set this on 26 Jul 2026, superseding the
// earlier rule that withheld the name until a calibration gate passed. The reasoning: the number is
// genuinely calculated, DEFCON and minutes are handled properly, and the model's real limitations are
// reported on the Analysis page rather than hidden behind a euphemism. metricName() remains the only
// source of the label so no screen can drift.

export const UPGRADES = {
  // Dates come from config/schedule.json and nowhere else. Never retype one here.
  score: SCHEDULE.upgrades.score,
  minutes: SCHEDULE.upgrades.minutes,
  structure: SCHEDULE.upgrades.structure,
};

export const metricName = () => "xP";
export const metricLabel = () => "xP · PROJECTED POINTS";
/* Kept as a no-op so no screen breaks. Nothing is labelled provisional to the user any more. */
export const interimChip = () => null;

/* Per-90 attacking output from last season's Understat row: the strongest real signal available
   before a ball is kicked in 2026/27. Returns null when the player has no usable history. */
function understatPer90(u) {
  if (!u || !u.minutes || u.minutes < 180) return null;
  const per90 = ((Number(u.xg) || 0) + (Number(u.xa) || 0)) / (u.minutes / 90);
  return per90;
}

/* Availability multiplier, straight off the FPL fields. */
export function availabilityMult(p) {
  if (p.status === "i" || p.status === "s" || p.status === "u" || p.status === "n") return 0;
  if (p.chance_of_playing !== null && p.chance_of_playing !== undefined) {
    return Math.max(0, Math.min(1, p.chance_of_playing / 100));
  }
  return p.status === "d" ? 0.5 : 1;
}

/* Fixture multiplier from the market's implied goal environment. Attackers ride their own
   team's lambda; goalkeepers and defenders ride the opponent's, inverted. */
export function fixtureMult(p, env, leagueMean) {
  if (!env || !leagueMean) return 1;
  const own = env.forGoals;
  const against = env.againstGoals;
  if (own === null || against === null) return 1;
  const half = leagueMean / 2;
  if (p.position === "GKP" || p.position === "DEF") {
    return Math.max(0.55, Math.min(1.6, (2 * half - against) / half));
  }
  return Math.max(0.55, Math.min(1.6, own / half));
}

/* The interim score. Built only from observed data, in a stated priority order, and it reports
   which source it used so the UI can be honest about it.
   1. engine projection (ep_mean) when the projections table has a row
   2. last season's points per 90 from the archive view
   3. last season's Understat xG+xA per 90 mapped through the ruleset's own goal/assist values
   Nothing falls back to price or guesswork: a player with no history scores 0 and is marked. */
export function buildScorer({ projections, archivePer90, understat, envByTeam, leagueMeanGoals, goalPoints, assistPoints, appearancePoints, minutesForecasts, shrinkageNineties, positionMeans }) {
  const proj = projections || new Map();
  const arch = archivePer90 || new Map();
  const us = understat || new Map();
  const mins = minutesForecasts || new Map();
  const shrinkS = Number.isFinite(Number(shrinkageNineties)) ? Number(shrinkageNineties) : 0;
  const positionMean = positionMeans || {};

  /* Shrink a per-90 rate toward the position mean by n/(n+S). Fitted S is 24 ninety-minute blocks,
     which is heavy on purpose: reliability on the held-out season shows the raw rates are
     over-spread, under-predicting low scorers and over-predicting high ones. With no sample size
     available the rate is returned untouched rather than shrunk by a guess. */
  const shrink = (rate, nineties, position) => {
    const mean = Number(positionMean[position]);
    if (!shrinkS || !Number.isFinite(mean) || !Number.isFinite(Number(nineties))) return rate;
    const n = Number(nineties);
    const w = n / (n + shrinkS);
    return w * rate + (1 - w) * mean;
  };

  /* Expected ninetieths of a match. The archive and Understat paths both produce a per-90 rate, so
     without this they answer "how good is he per full match" rather than "what will he return this
     week". Measured on the held-out 2025/26 season, applying it lifted rank correlation with actual
     points from +0.093 to +0.484 and cut RMSE from 3.63 to 2.69, which is the single largest
     improvement available from components that already exist.
     Returns null when no forecast exists, and the caller then leaves the rate unscaled rather than
     multiplying by a guess. */
  const expectedNineties = (p) => {
    const f = mins.get(p.fpl_id);
    if (!f) return null;
    const pStart = Number(f.p_start);
    const startMin = Number(f.exp_min_start);
    if (!Number.isFinite(pStart) || !Number.isFinite(startMin)) return null;
    const pCameo = Number.isFinite(Number(f.p_cameo)) ? Number(f.p_cameo) : 0;
    const cameoMin = Number.isFinite(Number(f.exp_min_cameo)) ? Number(f.exp_min_cameo) : 0;
    const expMinutes = pStart * startMin + pCameo * cameoMin;
    if (!(expMinutes > 0)) return null;
    return Math.min(expMinutes, 90) / 90;
  };

  const scoreOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.ep_mean !== null && row.ep_mean !== undefined) {
      /* SMALL-SAMPLE GUARD ON THE ENGINE.
       *
       * The engine returned its own number with no reference to how much history the player has.
       * A defender with a third of a season's minutes was projected 7.4, which implies a near-certain
       * clean sheet plus attacking returns. The allocation layer was extrapolating a share from almost
       * nothing, and the engine has never been validated, so its raw output cannot be trusted at thin
       * sample sizes.
       *
       * The same fitted shrinkage the interim path uses is applied here: pull toward the position mean
       * by n/(n+S) where n is prior-season nineties. A full season is untouched; a third of a season
       * moves most of the way to the mean. This is a discipline the engine should have had, not a
       * correction invented for this bug. */
      const engine = Number(row.ep_mean);
      const hist = arch.get(p.fpl_id);
      const nineties = hist ? Number(hist.nineties) : 0;
      return round2(shrink(engine, nineties, p.position));
    }

    const avail = availabilityMult(p);
    if (avail === 0) return 0;
    const env = envByTeam ? envByTeam.get(p.team_id) : null;
    const fx = fixtureMult(p, env, leagueMeanGoals);

    const nineties = expectedNineties(p);

    const a = arch.get(p.fpl_id);
    if (a && a.nineties >= 2) {
      const rate = shrink(a.pointsPer90, a.nineties, p.position) * fx * avail;
      return round2(nineties === null ? rate : rate * nineties);
    }

    const per90 = understatPer90(us.get(p.fpl_id));
    if (per90 !== null) {
      const gp = goalPoints[p.position] ?? 0;
      const attacking = per90 * ((gp + assistPoints) / 2);
      const rate = (attacking + appearancePoints) * fx * avail;
      return round2(nineties === null ? rate : rate * nineties);
    }
    return 0;
  };

  const sourceOf = (p) => {
    if (proj.get(p.fpl_id)) return "engine";
    const a = arch.get(p.fpl_id);
    if (a && a.nineties >= 2) return "archive";
    if (understatPer90(us.get(p.fpl_id)) !== null) return "understat";
    return "none";
  };

  /* Distribution accessors. The engine supplies real quantiles; the interim path supplies a
     symmetric band derived from the score itself and is flagged as such by sourceOf(). */
  const bandOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.quantiles) {
      const q = row.quantiles;
      return { p10: num(q.p10 ?? q.p5), p50: num(q.p50), p90: num(q.p90 ?? q.p95), real: true };
    }
    const s = scoreOf(p);
    return { p10: round2(Math.max(0, s * 0.35)), p50: round2(s), p90: round2(s * 1.9), real: false };
  };

  const tailOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.p_12plus !== null && row.p_12plus !== undefined) return Number(row.p_12plus);
    return null;
  };

  const floorOf = (p) => bandOf(p).p10;

  return { scoreOf, sourceOf, bandOf, tailOf, floorOf };
}

const round2 = (v) => +Number(v).toFixed(2);
const num = (v) => (v === null || v === undefined ? null : Number(v));

/* What the app says about where its numbers came from. Kept here with metricName so the label and
   its provenance can never drift apart. */
export function provenanceLine(model) {
  const { engineRows = 0, livePlayers = 0, gateOpen } = model || {};
  if (engineRows === 0) {
    return "Scores from last season's output and the market's goal lines. The engine has not run yet.";
  }
  const pct = livePlayers > 0 ? Math.round((engineRows / livePlayers) * 100) : 0;
  const state = gateOpen ? "calibration passed" : "calibration not yet run";
  if (pct >= 99) return `Projections from the simulation engine, ${state}.`;
  // The honest version: say how much of the list the engine covers and what the rest is.
  return `Simulation engine for ${engineRows} of ${livePlayers} players (${pct}%), ${state}. `
    + `The rest are scored from last season's output and the market's goal lines, shrunk toward the position mean, so their spread is narrower.`;
}
