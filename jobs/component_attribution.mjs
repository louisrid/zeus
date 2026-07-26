// B-08c · COMPONENT ATTRIBUTION.
//
// The baseline gate says whether the model is right. This says which part of the game the points
// actually come from, so a miss can be traced rather than shrugged at.
//
// Points are decomposed exactly as the rules pay them: appearance, goals, assists, clean sheet,
// bonus, saves, and negatives (cards, own goals, missed penalties, goals conceded). Two numbers are
// reported per component: the total it contributed, and its share of all absolute point movement.
//
// Share of movement is the useful one. A component with a large share is where a single-number
// projection has the most room to be wrong, because the model predicts a total and never says which
// component it expects. Read alongside the minutes scorecard: if appearance points dominate, then
// minutes accuracy is doing most of the work.
//
// PROTOCOL. Graded on the held-out season only, never used for fitting.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "component_attribution";
const HELD_OUT = process.env.ATTRIBUTION_SEASON || "2025-26";
const RULES = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url), "utf8"));

// Read the values from the ruleset so a rules change cannot silently invalidate this.
const v = (key) => {
  const node = RULES.scoring && RULES.scoring[key];
  if (node === undefined) throw new Error(`ruleset is missing scoring.${key}`);
  return typeof node === "object" ? Number(node.value) : Number(node);
};
const GOAL = { GKP: v("goal_gkp"), DEF: v("goal_def"), MID: v("goal_mid"), FWD: v("goal_fwd") };
const CS = { GKP: v("clean_sheet_gkp"), DEF: v("clean_sheet_def"), MID: v("clean_sheet_mid"), FWD: v("clean_sheet_fwd") };
const ASSIST = v("assist");

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
      .select("gw, position, minutes, total_points, goals, assists, clean_sheets, goals_conceded, saves, yellow, red, own_goals, pens_missed")
      .eq("season", season).order("gw").range(from, from + PAGE - 1);
    if (error) throw new Error(`${season}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export function decompose(r) {
  const pos = r.position;
  const minutes = Number(r.minutes) || 0;
  const num = (v) => Number(v) || 0;
  return {
    appearance: minutes >= 60 ? 2 : minutes > 0 ? 1 : 0,
    goals: num(r.goals) * (GOAL[pos] ?? 0),
    assists: num(r.assists) * ASSIST,
    clean_sheet: num(r.clean_sheets) * (CS[pos] ?? 0),
    bonus: num(r.bonus),
    saves: pos === "GKP" ? Math.floor(num(r.saves) / 3) : 0,
    negatives: -(num(r.yellow) + num(r.red) * 3 + num(r.own_goals) * 2 + num(r.pens_missed) * 2
      + (pos === "GKP" || pos === "DEF" ? Math.floor(num(r.goals_conceded) / 2) : 0)),
  };
}

export function attribute(rows) {
  const COMPONENTS = ["appearance", "goals", "assists", "clean_sheet", "bonus", "saves", "negatives"];
  const scopes = new Map();
  for (const r of rows) {
    const d = decompose(r);
    for (const scope of [null, r.position]) {
      const key = scope === null ? "ALL" : scope;
      const acc = scopes.get(key) || { n: 0, total: {}, abs: {} };
      acc.n += 1;
      for (const c of COMPONENTS) {
        acc.total[c] = (acc.total[c] || 0) + d[c];
        acc.abs[c] = (acc.abs[c] || 0) + Math.abs(d[c]);
      }
      scopes.set(key, acc);
    }
  }
  const out = [];
  for (const [scope, acc] of scopes) {
    const allAbs = COMPONENTS.reduce((a, c) => a + acc.abs[c], 0) || 1;
    for (const c of COMPONENTS) {
      out.push({
        position: scope === "ALL" ? null : scope,
        component: c, n: acc.n,
        total_points: acc.total[c],
        share_of_movement: acc.abs[c] / allAbs,
      });
    }
  }
  return out;
}

async function main() {
  const rows = await fetchSeason(HELD_OUT);
  if (!rows.length) throw new Error(`no rows for ${HELD_OUT}; run history-load first`);

  const results = attribute(rows).map((r) => ({
    held_out_season: HELD_OUT, ...r,
    total_points: Number(r.total_points.toFixed(1)),
    share_of_movement: Number(r.share_of_movement.toFixed(4)),
    note: `Decomposed with the 2026/27 ruleset. Share of movement is the share of all absolute point movement, which is where a single-number projection has the most room to be wrong.`,
  }));

  const { error } = await supabase.from("component_attribution").insert(results);
  if (error) throw new Error("component_attribution: " + error.message);

  const all = results.filter((r) => r.position === null).sort((a, b) => b.share_of_movement - a.share_of_movement);
  await beat("ok", all.map((r) => `${r.component} ${(r.share_of_movement * 100).toFixed(1)}%`).join(" · "));
  console.log("COMPONENT ATTRIBUTION");
  for (const r of all) {
    console.log(`  ${r.component.padEnd(13)} ${String(r.total_points).padStart(9)} pts   ${(r.share_of_movement * 100).toFixed(1)}% of movement`);
  }
}
// Only run when executed directly. Importing this module for its pure helpers must not start a run.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
