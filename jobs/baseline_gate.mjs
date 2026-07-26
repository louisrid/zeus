// B-08a · THE BASELINE GATE.
//
// The question this answers: do the numbers the app shows beat the simple alternatives?
// Until it is answered, every projection is labelled INTERIM SCORE rather than xP.
//
// WHAT IS BEING TESTED. The app's on-screen number today comes from the interim scorer: a blend of
// last season's points per 90 with the current season's rate, weighted m/(m+k) with k fitted on
// nine seasons. That is what appears on the pitch, so that is what is graded here. The full odds
// engine cannot be graded historically because we hold no historical odds, and pretending otherwise
// would be a fake benchmark. That limitation is written into the output.
//
// PROTOCOL. Fit on seasons up to 2024/25. Grade on 2025/26 only, which has never been touched.
// Walk forward inside the graded season: at gameweek t, only gameweeks before t are known.
//
// WHICH METRIC DECIDES. Three are computed and all three are recorded.
//   spearman  mean rank correlation with actual points, per gameweek. THIS IS THE VERDICT METRIC.
//   rmse      punishes missing the big scores, which is where rank is won and lost
//   mae       recorded but NOT the verdict, because FPL points are heavily skewed: most rows are one
//             or two points, so a constant near the median wins MAE while ranking nobody. A model
//             that cannot tell two midfielders apart is useless here even with a lower MAE.
// The tool's job is to say who to pick, so it is graded on whether it orders players correctly.
//
// BASELINES. The gate is passed only if the blend beats all three out of sample:
//   prior_season_ppg  last season's points per 90, scaled by minutes actually played
//   position_mean     the mean points per start for the player's position, fitted on history
//   zero              predicting zero every time, which any useful model must beat
//
// Any component that cannot beat the simpler version of itself gets cut. That decision is recorded
// here, not taken silently.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Read the fitted parameters rather than importing them. A bare JSON import needs an import
// attribute under plain Node, which the workflow runner does not supply, and jobs run under node
// directly rather than through the bundler.
const FITTED = JSON.parse(readFileSync(new URL("../config/fitted-params.json", import.meta.url), "utf8"));

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "baseline_gate";
const HELD_OUT = process.env.GATE_SEASON || "2025-26";
const TRAIN_END = "2024-25";
const K = FITTED.history_blend_k.value;
const PPS = FITTED.position_points_per_start;

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
      .select("season, gw, player_name, position, minutes, total_points")
      .eq("season", season)
      .order("gw")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${season}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export function seasonRates(rows) {
  // points per 90 per player across a whole season, only where the sample is real
  const agg = new Map();
  for (const r of rows) {
    const a = agg.get(r.player_name) || { pts: 0, min: 0 };
    a.pts += Number(r.total_points) || 0;
    a.min += Number(r.minutes) || 0;
    agg.set(r.player_name, a);
  }
  const out = new Map();
  for (const [name, a] of agg) if (a.min >= 450) out.set(name, (a.pts * 90) / a.min);
  return out;
}

function ranksOf(xs) {
  const order = xs.map((v, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a, b) {
  if (a.length < 3) return null;
  const ra = ranksOf(a), rb = ranksOf(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

export function scoreModels(graded, priorRates) {
  // Walk forward: cumulative minutes and points before the current gameweek only.
  const cum = new Map();
  const rows = graded.slice().sort((a, b) => a.gw - b.gw);
  const errs = {};
  // Per-gameweek prediction sets for the ranking metric. Predictions are made before kickoff, so
  // minutes are deliberately not used here: a model cannot know them at the point of decision.
  const perGw = new Map();
  const add = (model, pos, err) => {
    for (const key of [`${model}|all`, `${model}|${pos}`]) {
      const e = errs[key] || { n: 0, abs: 0, sq: 0 };
      e.n += 1; e.abs += Math.abs(err); e.sq += err * err;
      errs[key] = e;
    }
  };

  for (const r of rows) {
    const actual = Number(r.total_points) || 0;
    const minutes = Number(r.minutes) || 0;
    const played = Math.min(minutes, 90) / 90;
    const prior = priorRates.get(r.player_name);
    const c = cum.get(r.player_name) || { pts: 0, min: 0 };

    // Only grade rows where a prior-season rate exists, so every model faces the same rows.
    if (prior !== undefined) {
      const m = c.min;
      const w = m / (m + K);
      const current = m > 0 ? (c.pts * 90) / m : 0;
      const blend = (w * current + (1 - w) * prior) * played;
      add("blend", r.position, blend - actual);
      add("prior_season_ppg", r.position, prior * played - actual);
      add("position_mean", r.position, (PPS[r.position] || 0) * played - actual);
      add("zero", r.position, 0 - actual);

      for (const scope of ["all", r.position]) {
        const key = `${r.gw}|${scope}`;
        const d = perGw.get(key) || { actual: [], blend: [], prior_season_ppg: [], position_mean: [], zero: [] };
        d.actual.push(actual);
        d.blend.push(w * current + (1 - w) * prior);
        d.prior_season_ppg.push(prior);
        d.position_mean.push(PPS[r.position] || 0);
        d.zero.push(0);
        perGw.set(key, d);
      }
    }
    c.pts += actual; c.min += minutes;
    cum.set(r.player_name, c);
  }

  // Mean rank correlation across gameweeks, per model per scope.
  const rho = {};
  for (const [key, d] of perGw) {
    const scope = key.split("|")[1];
    for (const model of ["blend", "prior_season_ppg", "position_mean", "zero"]) {
      const s = spearman(d[model], d.actual);
      if (s === null || Number.isNaN(s)) continue;
      const k = `${model}|${scope}`;
      const acc = rho[k] || { sum: 0, n: 0 };
      acc.sum += s; acc.n += 1; rho[k] = acc;
    }
  }

  const out = [];
  for (const [key, e] of Object.entries(errs)) {
    const [model, position] = key.split("|");
    const r = rho[key];
    out.push({
      model, position: position === "all" ? null : position, n: e.n,
      mae: e.abs / e.n, rmse: Math.sqrt(e.sq / e.n),
      spearman: r && r.n ? r.sum / r.n : null,
      gameweeks: r ? r.n : 0,
    });
  }
  return out;
}

async function main() {
  const trainSeasons = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", TRAIN_END];
  const prior = await fetchSeason(TRAIN_END);
  if (!prior.length) throw new Error(`no rows for ${TRAIN_END}; run history-load first`);
  const graded = await fetchSeason(HELD_OUT);
  if (!graded.length) throw new Error(`no rows for ${HELD_OUT}; run history-load first`);

  const priorRates = seasonRates(prior);
  const results = scoreModels(graded, priorRates);

  // Verdict per scope: the blend passes only if its MAE is lower than every baseline's.
  const scopes = [...new Set(results.map((r) => r.position))];
  const rows = [];
  const lines = [];
  for (const scope of scopes) {
    const here = results.filter((r) => r.position === scope);
    const blend = here.find((r) => r.model === "blend");
    const baselines = here.filter((r) => r.model !== "blend");
    // Verdict on ranking. A constant can win MAE without ordering anybody, which is worthless here.
    const bestByRho = baselines.reduce((b, r) => (r.spearman === null ? b : (b === null || r.spearman > b.spearman ? r : b)), null);
    const bestByMae = baselines.reduce((b, r) => (b === null || r.mae < b.mae ? r : b), null);
    const passes = Boolean(blend && bestByRho && blend.spearman !== null && blend.spearman > bestByRho.spearman);
    for (const r of here) {
      rows.push({
        held_out_season: HELD_OUT, model: r.model, position: r.position, n: r.n,
        mae: Number(r.mae.toFixed(4)), rmse: Number(r.rmse.toFixed(4)),
        spearman: r.spearman === null ? null : Number(r.spearman.toFixed(4)),
        gameweeks: r.gameweeks,
        beats_best_baseline: r.model === "blend" ? passes : null,
        note: r.model === "blend"
          ? `Verdict on rank correlation. Graded on the interim scorer, not the odds engine, since no historical odds are held. k=${K}. Best baseline by ranking: ${bestByRho ? bestByRho.model : "none"}. Best by MAE: ${bestByMae ? bestByMae.model : "none"}.`
          : null,
      });
    }
    lines.push(`${scope || "ALL"}: rho ${blend && blend.spearman !== null ? blend.spearman.toFixed(4) : "n/a"} vs ${bestByRho ? bestByRho.model + " " + bestByRho.spearman.toFixed(4) : "n/a"} -> ${passes ? "PASS" : "FAIL"}`);
  }

  const { error } = await supabase.from("baseline_gate").insert(rows);
  if (error) throw new Error("baseline_gate: " + error.message);

  const overall = rows.find((r) => r.model === "blend" && r.position === null);
  const msg = `${HELD_OUT} held out · ${lines.join(" · ")}`;
  await beat("ok", msg);
  console.log("BASELINE GATE");
  for (const l of lines) console.log("  " + l);
  console.log(`  overall verdict: ${overall && overall.beats_best_baseline ? "PASS" : "FAIL"}`);
  console.log(`  trained on ${trainSeasons.length} seasons, graded on ${HELD_OUT} only`);
}
// Only run when executed directly. Importing this module for its pure helpers must not start a run.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
