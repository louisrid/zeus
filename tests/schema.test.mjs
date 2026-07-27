// Schema contract. The Package 2 BPS backtest failed because it wrote columns the schema did not
// have, and nothing caught it until the insert ran in production. This test parses the checked-in
// SQL and asserts every column Package 3 writes actually exists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SQL = ["supabase/schema.sql", "supabase/migration-002.sql", "supabase/migration-003.sql", "supabase/migration-004.sql"]
  .map((f) => readFileSync(join(ROOT, f), "utf8"))
  .join("\n");

/* Build table -> Set(columns) from create-table bodies and alter-table-add-column statements. */
function columnMap(sql) {
  const map = new Map();
  const add = (table, col) => {
    const t = table.toLowerCase();
    if (!map.has(t)) map.set(t, new Set());
    map.get(t).add(col.toLowerCase());
  };

  for (const m of sql.matchAll(/create table if not exists\s+(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const table = m[1];
    let depth = 0;
    let line = "";
    const lines = [];
    for (const ch of m[2]) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { lines.push(line); line = ""; continue; }
      line += ch;
    }
    lines.push(line);
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || /^(primary key|unique|check|constraint|foreign key)\b/i.test(t)) continue;
      const name = t.split(/\s+/)[0];
      if (/^\w+$/.test(name)) add(table, name);
    }
  }
  for (const m of sql.matchAll(/alter table\s+(\w+)\s+add column if not exists\s+(\w+)/gi)) add(m[1], m[2]);
  return map;
}

const COLS = columnMap(SQL);
const has = (table, col) => {
  const set = COLS.get(table);
  assert.ok(set, `table ${table} is not in the checked-in SQL`);
  assert.ok(set.has(col.toLowerCase()), `${table}.${col} does not exist in the schema`);
};

test("the SQL parser found the tables it should have", () => {
  for (const t of ["players", "teams", "fixtures", "projections", "minutes_forecasts", "team_covariances",
    "presser_signals", "set_piece_duty", "squad_drafts", "model_versions", "model_gates", "engine_run_params",
    "calibration_metrics", "pipeline_heartbeats", "implied_goals", "odds_snapshots"]) {
    assert.ok(COLS.has(t), `${t} missing from parse`);
  }
});

test("every column the projection run writes into projections exists", () => {
  for (const c of ["player_id", "gw", "model_version", "ep_mean", "ep_sd", "p_goal", "p_assist", "p_cs",
    "e_bonus", "e_defcon", "e_goals", "e_assists", "quantiles", "p_12plus", "ep_home", "ep_away",
    "prior_blend", "odds_backed", "computed_at"]) {
    has("projections", c);
  }
});

test("every column the projection run writes into minutes_forecasts exists", () => {
  for (const c of ["player_id", "gw", "model_version", "p_start", "p_cameo", "p60", "p60_given_start",
    "exp_min_start", "exp_min_cameo", "wc_load_flag"]) {
    has("minutes_forecasts", c);
  }
});

test("the remaining projection-run write targets exist", () => {
  for (const c of ["gw", "model_version", "team_id", "matrix"]) has("team_covariances", c);
  for (const c of ["version", "git_sha", "data_snapshot_at", "ruleset_version", "notes"]) has("model_versions", c);
  for (const c of ["model_version", "param_key", "upgrade_date"]) has("engine_run_params", c);
  for (const c of ["fixture_id", "odds_snapshot_id", "lambda_home", "lambda_away", "deoverround_method", "fit_residual"]) {
    has("implied_goals", c);
  }
  for (const c of ["job_name", "last_run_at", "last_success_at", "status", "message"]) has("pipeline_heartbeats", c);
});

test("every column the presser job writes exists", () => {
  for (const c of ["player_id", "gw", "signal", "confidence", "source_url", "summary"]) has("presser_signals", c);
  for (const c of ["team_id", "player_id", "kind", "rank", "as_of", "source"]) has("set_piece_duty", c);
});

test("every column the drafts route writes exists", () => {
  for (const c of ["name", "mode", "squad", "eval_cache", "is_plan_of_record", "updated_at"]) has("squad_drafts", c);
});

test("the columns the tool reads from the new views are defined", () => {
  assert.match(SQL, /create or replace view player_prior_season/);
  assert.match(SQL, /create or replace view fixture_goal_env/);
  for (const c of ["points_per_90", "nineties", "starts", "starts60", "start_minutes", "cameos", "cameo_minutes",
    "cbit", "recoveries", "key_passes", "pens_taken", "pens_scored"]) {
    assert.ok(SQL.includes(c), `player_prior_season should expose ${c}`);
  }
  for (const c of ["lambda_home", "lambda_away", "home_team", "away_team", "kickoff_utc"]) {
    assert.ok(SQL.includes(c), `fixture_goal_env should expose ${c}`);
  }
});

test("the Package 2 BPS backtest can now persist its results", () => {
  // jobs/bps_backtest.mjs writes { model, metric, value, run_at } and metric names outside the
  // original CHECK constraint. Migration 004 adds the columns and drops the constraint.
  for (const c of ["model", "run_at", "metric", "value"]) has("calibration_metrics", c);
  const m4 = readFileSync(join(ROOT, "supabase/migration-004.sql"), "utf8");
  assert.match(m4, /drop constraint/i);
  const job = readFileSync(join(ROOT, "jobs/bps_backtest.mjs"), "utf8");
  for (const key of ["model:", "metric:", "value:", "run_at:"]) {
    assert.ok(job.includes(key), `the shipped job writes ${key} and the schema must accept it`);
  }
});

test("the view the prior-season aggregate reads from carries the columns it sums", () => {
  for (const c of ["clearances_blocks_interceptions", "tackles", "recoveries", "key_passes", "saves",
    "yellow", "red", "own_goals", "pens_taken", "pens_scored", "started", "minutes", "total_points"]) {
    has("player_match_stats", c);
  }
  has("player_match_stats", "pens_missed");
  has("fixtures", "season");
});

test("the gate row and its index are created", () => {
  for (const c of ["key", "passed", "upgrade_date", "note", "updated_at"]) has("model_gates", c);
  assert.match(SQL, /create unique index if not exists set_piece_duty_unique/);
});

test("every table the browser reads has row level security and an anonymous read policy", () => {
  // predicted_lineups shipped with neither, so a successful pull would still have shown an empty page: the
  // browser holds a read-only anon key and RLS without a policy denies everything.
  const sql = readdirSync(join(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, "supabase", f), "utf8")).join("\n");

  const created = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
  const secured = new Set([...sql.matchAll(/alter table (\w+) enable row level security/g)].map((m) => m[1]));
  const readable = new Set([...sql.matchAll(/create policy \w+ on (\w+) for select/g)].map((m) => m[1]));

  // Tables only ever written by jobs through the service key do not need a policy; these are the ones a
  // page reads.
  const BROWSER_READS = ["predicted_lineups"];
  for (const t of BROWSER_READS) {
    assert.ok(created.includes(t), `${t} must be created by a migration`);
    assert.ok(secured.has(t), `${t} must enable row level security`);
    assert.ok(readable.has(t), `${t} must grant an anonymous read, or the page shows nothing`);
  }
});
