"use client";
// Loads everything the scoring layer needs in one pass, on top of loadCore().
// Read-only anon key throughout; all writes go through /api routes holding the service key.

import { sb } from "./data";
import rulesJson from "../config/rules-2026-27.json";
import FITTED from "../config/fitted-params.json";
import { buildScorer } from "./solver/score.mjs";

const val = (node) => (node && typeof node === "object" && "value" in node ? node.value : node);

const GOAL_POINTS = {
  GKP: val(rulesJson.scoring.goal_gkp),
  DEF: val(rulesJson.scoring.goal_def),
  MID: val(rulesJson.scoring.goal_mid),
  FWD: val(rulesJson.scoring.goal_fwd),
};
const ASSIST_POINTS = val(rulesJson.scoring.assist);
const APPEARANCE_POINTS = val(rulesJson.scoring.appearance_60_plus);

export async function loadModel(core) {
  const supabase = sb();
  const gw = core.currentGw;
  const idToFpl = new Map();
  for (const p of core.players) idToFpl.set(p.id, p.fpl_id);

  const [projRes, minRes, priorRes, usRes, envRes, gateRes] = await Promise.all([
    supabase.from("projections").select("*").gte("gw", gw).lte("gw", gw + 11),
    supabase.from("minutes_forecasts").select("*").eq("gw", gw),
    supabase.from("player_prior_season").select("player_id, points, minutes, nineties, points_per_90"),
    supabase.from("understat_player_season").select("player_id, season, minutes, xg, xa").eq("season", "2025-26"),
    supabase.from("fixture_goal_env").select("*").gte("gw", gw).lte("gw", gw + 11),
    supabase.from("model_gates").select("key, passed, upgrade_date").eq("key", "xp_visible").maybeSingle(),
  ]);

  // A missing table or view is not fatal: the tool falls back to interim scoring and says so.
  const projRows = projRes.error ? [] : projRes.data || [];
  const minRows = minRes.error ? [] : minRes.data || [];
  const priorRows = priorRes.error ? [] : priorRes.data || [];
  const usRows = usRes.error ? [] : usRes.data || [];
  const envRows = envRes.error ? [] : envRes.data || [];
  const gateOpen = Boolean(!gateRes.error && gateRes.data && gateRes.data.passed);

  // Current-gameweek projection per player, plus the ordered per-gameweek series for the horizon.
  const projections = new Map();
  const perGw = new Map();
  for (const r of projRows) {
    const fpl = idToFpl.get(r.player_id);
    if (!fpl) continue;
    if (r.gw === gw) projections.set(fpl, r);
    if (!perGw.has(fpl)) perGw.set(fpl, []);
    const q = r.quantiles || {};
    perGw.get(fpl).push({
      gw: r.gw,
      ep_mean: Number(r.ep_mean) || 0,
      p10: Number(q.p10 ?? q.p5 ?? 0),
      p90: Number(q.p90 ?? q.p95 ?? 0),
    });
  }
  for (const [, rows] of perGw) rows.sort((a, b) => a.gw - b.gw);

  /* minutes_forecasts is keyed by (player_id, gw, model_version). Without choosing a version, the
     last row returned wins arbitrarily, which means the scorer could silently use a stale model.
     The newest version per player is taken; model_version strings are chronological by convention,
     and a row with no version loses to one that has it. */
  const minutes = new Map();
  const minutesVersion = new Map();
  for (const r of minRows) {
    const fpl = idToFpl.get(r.player_id);
    if (!fpl) continue;
    const v = r.model_version || "";
    const seen = minutesVersion.get(fpl);
    if (seen !== undefined && seen >= v) continue;
    minutesVersion.set(fpl, v);
    minutes.set(fpl, r);
  }
  const archivePer90 = new Map();
  for (const r of priorRows) {
    const fpl = idToFpl.get(r.player_id);
    if (!fpl) continue;
    archivePer90.set(fpl, {
      pointsPer90: Number(r.points_per_90) || 0,
      nineties: Number(r.nineties) || 0,
      points: Number(r.points) || 0,
    });
  }
  const understat = new Map();
  for (const r of usRows) {
    const fpl = idToFpl.get(r.player_id);
    if (fpl) understat.set(fpl, r);
  }

  // Next fixture goal environment per team, and the league mean the market itself implies.
  const envByTeam = new Map();
  const sorted = [...envRows].sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));
  for (const r of sorted) {
    if (!envByTeam.has(r.home_team)) {
      envByTeam.set(r.home_team, { forGoals: Number(r.lambda_home), againstGoals: Number(r.lambda_away), home: true, gw: r.gw });
    }
    if (!envByTeam.has(r.away_team)) {
      envByTeam.set(r.away_team, { forGoals: Number(r.lambda_away), againstGoals: Number(r.lambda_home), home: false, gw: r.gw });
    }
  }
  const leagueMeanGoals = envRows.length
    ? envRows.reduce((s, r) => s + Number(r.lambda_home) + Number(r.lambda_away), 0) / envRows.length
    : null;

  const scorer = buildScorer({
    projections,
    archivePer90,
    understat,
    envByTeam,
    leagueMeanGoals,
    goalPoints: GOAL_POINTS,
    assistPoints: ASSIST_POINTS,
    appearancePoints: APPEARANCE_POINTS,
    minutesForecasts: minutes,
    shrinkageNineties: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
  });

  const engineRows = projections.size;
  // How much of the player list the engine actually covers. A list that is half engine and half
  // interim must not describe itself as an engine list: the two are the same units but the interim
  // path is shrunk toward the position mean, so their spread differs.
  const livePlayers = core.players.length;
  const engineCoverage = livePlayers > 0 ? engineRows / livePlayers : 0;
  return {
    ...scorer,
    minutes,
    perGw,
    envByTeam,
    gateOpen,
    engineRows,
    engineCoverage,
    livePlayers,
    oddsRows: envRows.length,
    gw,
  };
}

/* Where the numbers currently come from, in one line of user language for the panel footer. */
// provenanceLine lives in lib/solver/score.mjs, which owns what a number is called.
export { provenanceLine } from "./solver/score.mjs";
