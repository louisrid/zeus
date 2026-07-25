"use client";
/* THE GATE.
   xP is computed and stored by the projection run, but it is not shown anywhere in the UI until
   walk-forward validation passes. Until then every surface shows the INTERIM RATING defined here:
   a transparent blend of what has actually been observed — points per appearance, recent form, and
   points per pound — nudged by the fixture's goal environment when a market line exists.

   It is deliberately NOT a projection and is never called xP. It never writes to `projections`.
   The gate lives in the database (model_gates.xp_ui) so the calibration harness flips it, not a
   code edit. */
import params from "../config/model-params.json";

export const GATE_FALLBACK = {
  passed: false,
  upgrade_label: "INTERIM · xP UNLOCKS AT CALIBRATION · BEFORE 7 AUG",
  detail: "Walk-forward validation has not run. Ratings below are observed data, not projections.",
};

export async function loadGate(sb) {
  try {
    const { data, error } = await sb.from("model_gates").select("*").eq("gate", "xp_ui").limit(1);
    if (error || !data || !data.length) return GATE_FALLBACK;
    const g = data[0];
    return {
      passed: Boolean(g.passed),
      upgrade_label: g.upgrade_label || GATE_FALLBACK.upgrade_label,
      detail: g.detail || GATE_FALLBACK.detail,
    };
  } catch {
    return GATE_FALLBACK;
  }
}

/* The interim rating, 0 to 10. */
export function interimRating(p, ctx) {
  const w = params.interim.weights.value;
  const scale = params.interim.scale_max.value;

  const ppg = Number(p.ppg || 0);                                  // points per appearance
  const form = Number(p.form || 0);                                // FPL rolling form
  const valueRate = Number(p.price) > 0 ? (Number(p.total_points || 0) / Number(p.price)) : 0;

  // normalise each component against the population so the blend is scale-free
  const n = (x, max) => (max > 0 ? Math.min(1, x / max) : 0);
  const base = w.ppg * n(ppg, ctx.maxPpg) + w.form * n(form, ctx.maxForm) + w.value_rate * n(valueRate, ctx.maxValueRate);

  let rating = base * scale;

  // availability: a flagged player's observed rate overstates what he is about to deliver
  if (p.status && p.status !== "a") rating *= p.status === "d" ? 0.75 : 0.15;
  if (p.chance_of_playing !== null && p.chance_of_playing !== undefined) {
    rating *= Math.max(0.1, Number(p.chance_of_playing) / 100);
  }

  // fixture nudge, only when a market-derived goal environment exists for the next fixture
  const swing = params.interim.fixture_swing.value;
  if (ctx.envByTeam && ctx.envByTeam.has(p.team_id)) {
    const env = ctx.envByTeam.get(p.team_id);       // -1 (worst) .. +1 (best), from implied goals
    rating *= 1 + swing * env;
  }

  return +Math.max(0, Math.min(scale, rating)).toFixed(1);
}

/* Population maxima for the normalisation, computed once per page load. */
export function ratingContext(players, envByTeam) {
  const max = (fn) => players.reduce((m, p) => Math.max(m, Number(fn(p) || 0)), 0);
  return {
    maxPpg: max((p) => p.ppg),
    maxForm: max((p) => p.form),
    maxValueRate: max((p) => (Number(p.price) > 0 ? Number(p.total_points || 0) / Number(p.price) : 0)),
    envByTeam: envByTeam || null,
  };
}

/* Attach a rating to every player. When the gate opens this becomes the projection's ep_mean
   and the label changes — one switch, one place. */
export function scorePlayers(players, gate, projections, envByTeam) {
  const ctx = ratingContext(players, envByTeam);
  const projById = projections || new Map();
  return players.map((p) => {
    const proj = projById.get(p.id);
    if (gate.passed && proj) {
      return {
        ...p,
        score: +Number(proj.ep_mean).toFixed(1),
        scoreLabel: "xP",
        p10: proj.quantiles?.p10 ?? null,
        p90: proj.quantiles?.p90 ?? null,
        p12: proj.p_12plus ?? null,
        pStart: proj.p_start ?? null,
        lowSample: Boolean(proj.low_sample),
      };
    }
    return {
      ...p,
      score: interimRating(p, ctx),
      scoreLabel: "RATING",
      p10: null, p90: null, p12: null, pStart: null,
      lowSample: false,
    };
  });
}

/* Team goal environments from stored implied goals: how good the next fixture looks, scaled
   to -1..+1 across the gameweek. Returns null when no fixture in the gameweek has a market line,
   which is why the interim rating degrades gracefully rather than inventing a fixture effect. */
export function goalEnvironments(fixtures, impliedByFixture) {
  if (!impliedByFixture || impliedByFixture.size === 0) return null;
  const raw = new Map();
  for (const f of fixtures) {
    const ig = impliedByFixture.get(f.id);
    if (!ig) continue;
    raw.set(f.home_team, Number(ig.lambda_home) - Number(ig.lambda_away));
    raw.set(f.away_team, Number(ig.lambda_away) - Number(ig.lambda_home));
  }
  if (raw.size === 0) return null;
  const vals = [...raw.values()];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const out = new Map();
  for (const [teamId, v] of raw) out.set(teamId, ((v - lo) / span) * 2 - 1);
  return out;
}
