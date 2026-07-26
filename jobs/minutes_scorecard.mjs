// B-08b · THE MINUTES SCORECARD.
//
// Minutes multiply every other component of a projection, and they are far less noisy than points,
// so error here is measurable and fixable. That is why minutes get their own scorecard rather than
// being folded into the points gate.
//
// PROTOCOL. Rates are fitted on 2024/25 and graded on 2025/26, which is never used for fitting.
// Inside the graded season it walks forward: at gameweek t only earlier gameweeks are known.
//
// SPLIT. Results are reported for settled squads and rotation-heavy squads separately, because a
// model that looks accurate overall can be useless exactly where rotation decides your gameweek.
// Rotation level is measured on the PRIOR season only, so the split itself leaks nothing.
//
// METRICS. Brier score for P(start) and P(60+), lower is better. Mean absolute error in minutes.
// Accuracy of the start call at a 0.5 threshold. Every one is compared against the only honest
// baseline: always predicting the league base rate.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "minutes_scorecard";
const HELD_OUT = process.env.SCORECARD_SEASON || "2025-26";
const FIT_ON = "2024-25";
const APPS_WEIGHT = 8;        // appearances before the current season outweighs last season's rate
const SETTLED_THRESHOLD = 0.78; // share of starts taken by a core of fourteen

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
    const { data, error } = await supabase
      .from("history_player_gw")
      .select("gw, player_name, team, position, minutes, started")
      .eq("season", season).order("gw").range(from, from + PAGE - 1);
    if (error) throw new Error(`${season}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export function priorRates(rows) {
  const agg = new Map();
  for (const r of rows) {
    const a = agg.get(r.player_name) || { apps: 0, starts: 0, startMin: 0 };
    a.apps += 1;
    if (r.started) { a.starts += 1; a.startMin += Number(r.minutes) || 0; }
    agg.set(r.player_name, a);
  }
  const out = new Map();
  for (const [name, a] of agg) {
    if (a.apps < 10) continue;
    out.set(name, { startRate: a.starts / a.apps, minutesWhenStarting: a.starts ? a.startMin / a.starts : 0 });
  }
  return out;
}

/* Rotation level per club, from the prior season only. A club whose starts are concentrated in a
   core of fourteen is settled; one that spreads them is rotation-heavy. */
export function rotationLevels(rows) {
  const byTeam = new Map();
  for (const r of rows) {
    if (!r.team) continue;
    const t = byTeam.get(r.team) || new Map();
    t.set(r.player_name, (t.get(r.player_name) || 0) + (r.started ? 1 : 0));
    byTeam.set(r.team, t);
  }
  const out = new Map();
  for (const [team, players] of byTeam) {
    const starts = [...players.values()].sort((a, b) => b - a);
    const total = starts.reduce((a, b) => a + b, 0) || 1;
    const core = starts.slice(0, 14).reduce((a, b) => a + b, 0);
    out.set(team, core / total >= SETTLED_THRESHOLD ? "settled" : "rotation-heavy");
  }
  return out;
}

export function grade(graded, prior, rotation) {
  const cum = new Map();
  const buckets = new Map();
  const push = (key, f) => {
    const b = buckets.get(key) || { n: 0, bsStart: 0, bs60: 0, maeMin: 0, correct: 0 };
    f(b); b.n += 1; buckets.set(key, b);
  };
  const baseRate = graded.filter((r) => r.started).length / (graded.length || 1);
  let baseBrier = 0;
  for (const r of graded) baseBrier += (baseRate - (r.started ? 1 : 0)) ** 2;
  baseBrier /= graded.length || 1;

  for (const r of graded.slice().sort((a, b) => a.gw - b.gw)) {
    const p = prior.get(r.player_name);
    const c = cum.get(r.player_name) || { apps: 0, starts: 0, startMin: 0 };
    if (p) {
      const m = c.apps;
      const w = m / (m + APPS_WEIGHT);
      const currentRate = m ? c.starts / m : 0;
      const pStart = w * currentRate + (1 - w) * p.startRate;
      const currentSm = c.starts ? c.startMin / c.starts : 0;
      const minutesIfStart = w * currentSm + (1 - w) * p.minutesWhenStarting;
      const expMinutes = pStart * minutesIfStart;
      // A starter who is routinely substituted reaches sixty less often than one who plays out.
      const p60 = pStart * (minutesIfStart >= 75 ? 0.86 : 0.6);
      const actualStart = r.started ? 1 : 0;
      const actual60 = (Number(r.minutes) || 0) >= 60 ? 1 : 0;
      const bucket = rotation.get(r.team) || "unknown";
      for (const key of ["ALL", bucket]) {
        push(key, (b) => {
          b.bsStart += (pStart - actualStart) ** 2;
          b.bs60 += (p60 - actual60) ** 2;
          b.maeMin += Math.abs(expMinutes - (Number(r.minutes) || 0));
          b.correct += (pStart >= 0.5) === Boolean(r.started) ? 1 : 0;
        });
      }
    }
    c.apps += 1;
    if (r.started) { c.starts += 1; c.startMin += Number(r.minutes) || 0; }
    cum.set(r.player_name, c);
  }

  const out = [];
  for (const [bucket, b] of buckets) {
    out.push({
      bucket, n: b.n,
      brier_start: b.bsStart / b.n,
      brier_60: b.bs60 / b.n,
      mae_minutes: b.maeMin / b.n,
      start_accuracy: b.correct / b.n,
      baseline_brier_start: baseBrier,
      beats_baseline: b.bsStart / b.n < baseBrier,
    });
  }
  return out;
}

async function main() {
  const fitRows = await fetchSeason(FIT_ON);
  if (!fitRows.length) throw new Error(`no rows for ${FIT_ON}; run history-load first`);
  const gradedRows = await fetchSeason(HELD_OUT);
  if (!gradedRows.length) throw new Error(`no rows for ${HELD_OUT}; run history-load first`);

  const results = grade(gradedRows, priorRates(fitRows), rotationLevels(fitRows));
  const rows = results.map((r) => ({
    held_out_season: HELD_OUT,
    bucket: r.bucket, n: r.n,
    brier_start: Number(r.brier_start.toFixed(4)),
    brier_60: Number(r.brier_60.toFixed(4)),
    mae_minutes: Number(r.mae_minutes.toFixed(2)),
    start_accuracy: Number(r.start_accuracy.toFixed(4)),
    baseline_brier_start: Number(r.baseline_brier_start.toFixed(4)),
    beats_baseline: r.beats_baseline,
    note: `Rates fitted on ${FIT_ON}, graded walk-forward on ${HELD_OUT}. Rotation level measured on ${FIT_ON} only.`,
  }));

  const { error } = await supabase.from("minutes_scorecard").insert(rows);
  if (error) throw new Error("minutes_scorecard: " + error.message);

  const all = rows.find((r) => r.bucket === "ALL");
  const msg = rows.map((r) => `${r.bucket} brier ${r.brier_start} acc ${(r.start_accuracy * 100).toFixed(1)}%`).join(" · ");
  await beat("ok", msg);
  console.log("MINUTES SCORECARD");
  for (const r of rows) {
    console.log(`  ${r.bucket.padEnd(15)} n ${String(r.n).padStart(6)}  brier(start) ${r.brier_start}  brier(60+) ${r.brier_60}  MAE minutes ${r.mae_minutes}  start accuracy ${(r.start_accuracy * 100).toFixed(1)}%`);
  }
  console.log(`  baseline brier (always predict the base rate): ${all ? all.baseline_brier_start : "n/a"}`);
  console.log(`  verdict: ${all && all.beats_baseline ? "PASS" : "FAIL"}`);
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
