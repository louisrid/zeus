import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* BATCH 3 GUARD. The live `players` table mutates in place, so any model job that reads its mutable
   fields while building HISTORICAL features is reading the future. Historical features come from
   history_player_gw (which carries as_of) or player_snapshots, never from the live row. */
const MODEL_JOBS = ["projections_run.mjs", "minutes_fit.mjs", "baseline_gate.mjs"];

test("no model job builds historical features from the live mutable fields", () => {
  const offenders = [];
  for (const f of readdirSync("jobs")) {
    if (!MODEL_JOBS.includes(f)) continue;
    const src = readFileSync(`jobs/${f}`, "utf8");
    // Reading live form/ppg for a historical fit is the leak. Reading them for the CURRENT gw is fine
    // and is marked with the literal comment "live-ok" where it happens.
    for (const field of ["form", "ppg"]) {
      const re = new RegExp(`players"\\)[\\s\\S]{0,200}${field}`, "g");
      const hits = (src.match(re) || []).filter((h) => !h.includes("live-ok"));
      if (hits.length) offenders.push(`${f}: reads live ${field} without live-ok marker`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

test("history rows are expected to carry as_of from migration 020 onward", () => {
  const sql = readFileSync("supabase/migration-020.sql", "utf8");
  assert.match(sql, /add column if not exists as_of timestamptz/);
  assert.match(sql, /player_snapshots/);
  assert.match(sql, /unique \(fpl_id, snapshot_date\)/, "one snapshot per player per day, idempotent");
});
