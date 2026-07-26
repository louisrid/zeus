// B-08d · RELIABILITY CURVES AND MINUTES COVERAGE.
//
// Two questions, both of which decide whether the numbers on screen deserve to be called xP.
//
// RELIABILITY. When the model says 6.0, does 6.0 happen? Predictions on the held-out season are
// sorted and split into five equal groups, and each group's mean prediction is compared with its
// mean outcome. A model can rank perfectly and still be miscalibrated: if every prediction is 40%
// too high, the order is right and the number is a lie. Bias is predicted minus actual, so positive
// means over-predicting.
//
// COVERAGE. The scorer multiplies a per-90 rate by expected minutes, which is the single largest
// source of its accuracy. That only works where a minutes forecast exists. This reports how many
// current players actually have one, because an uplift that reaches a third of the squad is not the
// uplift that was measured.
//
// PROTOCOL. Rates fitted on 2024/25, graded walk-forward on 2025/26, which is never used to fit.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "reliability";
const HELD_OUT = process.env.RELIABILITY_SEASON || "2025-26";
const FIT_ON = "2024-25";
const BINS = 5;
const FITTED = JSON.parse(readFileSync(new URL("../config/fitted-params.json", import.meta.url), "utf8"));
const K = FITTED.history_blend_k.value;
const APPS_WEIGHT = 8;

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

async function fetchSeason(season) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("history_player_gw")
      .select("gw, player_name, position, minutes, total_points, started")
      .eq("season", season).order("gw").range(from, from + PAGE - 1);
    if (error) throw new Error(`${season}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export function binReliability(points, bins = BINS) {
  const out = [];
  for (const scope of [null, "GKP", "DEF", "MID", "FWD"]) {
    const sub = points.filter((p) => scope === null || p.position === scope)
      .slice().sort((a, b) => a.predicted - b.predicted);
    if (sub.length < bins) continue;
    for (let b = 0; b < bins; b++) {
      const lo = Math.floor((sub.length * b) / bins);
      const hi = Math.floor((sub.length * (b + 1)) / bins);
      const chunk = sub.slice(lo, hi);
      if (!chunk.length) continue;
      const mp = chunk.reduce((a, x) => a + x.predicted, 0) / chunk.length;
      const ma = chunk.reduce((a, x) => a + x.actual, 0) / chunk.length;
      out.push({ position: scope, bin: b + 1, n: chunk.length, mean_predicted: mp, mean_actual: ma, bias: mp - ma });
    }
  }
  return out;
}

export function buildPredictions(graded, priorPoints, priorMinutes) {
  const cum = new Map();
  const mcum = new Map();
  const out = [];
  for (const r of graded.slice().sort((a, b) => a.gw - b.gw)) {
    const p = priorPoints.get(r.player_name);
    const mr = priorMinutes.get(r.player_name);
    const c = cum.get(r.player_name) || { pts: 0, min: 0 };
    const mc = mcum.get(r.player_name) || { apps: 0, starts: 0, sm: 0 };
    if (p !== undefined && mr !== undefined) {
      const m = c.min;
      const w = m / (m + K);
      const current = m > 0 ? (c.pts * 90) / m : 0;
      const rate = w * current + (1 - w) * p;
      const wa = mc.apps / (mc.apps + APPS_WEIGHT);
      const pStart = wa * (mc.apps ? mc.starts / mc.apps : 0) + (1 - wa) * mr.startRate;
      const minIf = wa * (mc.starts ? mc.sm / mc.starts : 0) + (1 - wa) * mr.minutesWhenStarting;
      const nineties = Math.min(pStart * minIf, 90) / 90;
      out.push({ position: r.position, predicted: rate * nineties, actual: Number(r.total_points) || 0 });
    }
    c.pts += Number(r.total_points) || 0;
    c.min += Number(r.minutes) || 0;
    cum.set(r.player_name, c);
    mc.apps += 1;
    if (r.started) { mc.starts += 1; mc.sm += Number(r.minutes) || 0; }
    mcum.set(r.player_name, mc);
  }
  return out;
}

async function main() {
  const fitRows = await fetchSeason(FIT_ON);
  if (!fitRows.length) throw new Error(`no rows for ${FIT_ON}; run history-load first`);
  const graded = await fetchSeason(HELD_OUT);
  if (!graded.length) throw new Error(`no rows for ${HELD_OUT}; run history-load first`);

  const aggP = new Map(), aggM = new Map();
  for (const r of fitRows) {
    const a = aggP.get(r.player_name) || { pts: 0, min: 0 };
    a.pts += Number(r.total_points) || 0; a.min += Number(r.minutes) || 0;
    aggP.set(r.player_name, a);
    const b = aggM.get(r.player_name) || { apps: 0, starts: 0, sm: 0 };
    b.apps += 1;
    if (r.started) { b.starts += 1; b.sm += Number(r.minutes) || 0; }
    aggM.set(r.player_name, b);
  }
  const priorPoints = new Map();
  for (const [n, a] of aggP) if (a.min >= 450) priorPoints.set(n, (a.pts * 90) / a.min);
  const priorMinutes = new Map();
  for (const [n, b] of aggM) {
    if (b.apps < 10) continue;
    priorMinutes.set(n, { startRate: b.starts / b.apps, minutesWhenStarting: b.starts ? b.sm / b.starts : 0 });
  }

  const bins = binReliability(buildPredictions(graded, priorPoints, priorMinutes));
  const rows = bins.map((b) => ({
    held_out_season: HELD_OUT, position: b.position, bin: b.bin, n: b.n,
    mean_predicted: Number(b.mean_predicted.toFixed(4)),
    mean_actual: Number(b.mean_actual.toFixed(4)),
    bias: Number(b.bias.toFixed(4)),
    note: "Bias is predicted minus actual. Negative in the low bins and positive in the high bins means the spread is too wide, which shrinkage corrects.",
  }));
  const { error } = await supabase.from("reliability_bins").insert(rows);
  if (error) throw new Error("reliability_bins: " + error.message);

  // Minutes coverage: does the scaling actually reach the squad?
  const { data: gwRow } = await supabase.from("gameweeks")
    .select("gw").eq("finished", false).order("gw").limit(1).single();
  const gw = gwRow ? gwRow.gw : null;
  const { count: total } = await supabase.from("players")
    .select("id", { count: "exact", head: true }).not("archive", "is", true);
  // minutes_forecasts is keyed by (player_id, gw, model_version), so a player with more than one
  // model version has more than one row. Counting rows reported 170% coverage, which is how the
  // fault surfaced. Distinct players is the only meaningful number, and only the newest model
  // version is what the scorer will read.
  let withForecast = 0;
  let modelVersion = null;
  if (gw !== null) {
    // Live player ids only. Forecasts may exist for archive players from relegated clubs, and
    // counting those is what produced a coverage figure above 100%.
    const live = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("players")
        .select("id").not("archive", "is", true).range(from, from + 999);
      if (error) throw new Error("players: " + error.message);
      if (!data || !data.length) break;
      for (const r of data) live.add(r.id);
      if (data.length < 1000) break;
    }

    const versions = new Set();
    const ids = new Set();
    const stale = new Set();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("minutes_forecasts")
        .select("player_id, model_version").eq("gw", gw).range(from, from + PAGE - 1);
      if (error) throw new Error("minutes_forecasts: " + error.message);
      if (!data || !data.length) break;
      for (const r of data) {
        if (live.has(r.player_id)) ids.add(r.player_id); else stale.add(r.player_id);
        if (r.model_version) versions.add(r.model_version);
      }
      if (data.length < PAGE) break;
    }
    withForecast = ids.size;
    // Newest version by string order, which the model_version convention makes chronological.
    modelVersion = [...versions].sort().pop() || null;
    if (stale.size) {
      console.log(`note: ${stale.size} forecasts belong to archive players and are excluded from coverage.`);
    }
    if (versions.size > 1) {
      console.log(`note: ${versions.size} model versions present for GW${gw} (${[...versions].sort().join(", ")}). Coverage counts distinct players, not rows.`);
    }
  }
  const coverage = total ? withForecast / total : 0;
  const { error: e2 } = await supabase.from("minutes_coverage").insert({
    gw, players_total: total || 0, players_with_forecast: withForecast,
    coverage: Number(Math.min(coverage, 1).toFixed(4)),
    note: `Distinct LIVE players with a GW${gw} forecast, not rows and not archive players. Newest model version present: ${modelVersion || "none"}. The scorer multiplies a per-90 rate by expected minutes only where a forecast exists.`,
  });
  if (e2) throw new Error("minutes_coverage: " + e2.message);

  const all = rows.filter((r) => r.position === null);
  const msg = `reliability bias ${all.map((r) => r.bias.toFixed(2)).join(" ")} · minutes coverage ${(coverage * 100).toFixed(1)}% at GW${gw}`;
  await beat("ok", msg);
  console.log("RELIABILITY");
  for (const r of all) console.log(`  bin ${r.bin}  n ${r.n}  predicted ${r.mean_predicted.toFixed(3)}  actual ${r.mean_actual.toFixed(3)}  bias ${r.bias >= 0 ? "+" : ""}${r.bias.toFixed(3)}`);
  console.log(`MINUTES COVERAGE  ${withForecast} of ${total} players have a GW${gw} forecast (${(coverage * 100).toFixed(1)}%)`);
}
// Only run when executed directly. Importing this module for its pure helpers must not start a run.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
