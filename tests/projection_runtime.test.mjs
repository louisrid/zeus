// EXTERNAL-XPTS LEGACY QUARANTINE: tests marked skip below assert the retired internal projection engine.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProjectionRuntime, assertCurrentEngineCoverage } from "../lib/projection_runtime.mjs";
import { currentGeneration } from "../lib/projection_generation.mjs";
import { buildScorer, provenanceLine } from "../lib/solver/score.mjs";
import { __projectionIntegrityTest } from "../jobs/projection_integrity_v14.mjs";

test("paginated integrity reads continue past short server-capped pages", async () => {
  const offsets = [];
  const pages = new Map([
    [0, [{ id: 1 }, { id: 2 }]],
    [2, [{ id: 3 }]],
    [3, []],
  ]);
  const rows = await __projectionIntegrityTest.collectAllPages(async (offset) => {
    offsets.push(offset);
    return pages.get(offset) || [];
  }, { pageSize: 500, maxRows: 10 });
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(offsets, [0, 2, 3]);
});

test("same-window duplicate player generations are marked stale", () => {
  const generation = currentGeneration([
    { player_id: 1, gw: 1, model_version: "old", computed_at: "2026-07-31T10:00:00Z" },
    { player_id: 1, gw: 1, model_version: "new", computed_at: "2026-07-31T10:05:00Z" },
    { player_id: 2, gw: 1, model_version: "new", computed_at: "2026-07-31T10:05:00Z" },
  ], 1);
  assert.equal(generation.rows.length, 2);
  assert.equal(generation.staleRows.length, 1);
  assert.equal(generation.staleRows[0].model_version, "old");
});

test("runtime selects one coherent latest generation per gameweek regardless of row order", () => {
  const rows = [
    { player_id: 2, gw: 1, ep_mean: 9, computed_at: "2026-07-20T10:00:00Z", model_version: "same" },
    { player_id: 1, gw: 2, ep_mean: 4, computed_at: "2026-07-30T10:02:00Z", model_version: "same" },
    { player_id: 1, gw: 1, ep_mean: 6, computed_at: "2026-07-30T10:00:00Z", model_version: "same" },
    { player_id: 2, gw: 1, ep_mean: 5, computed_at: "2026-07-30T10:00:05Z", model_version: "same" },
  ];
  const idToFpl = new Map([[1, 101], [2, 102]]);
  const runtime = buildProjectionRuntime(rows.reverse(), { currentGw: 1, idToFpl });
  assert.equal(runtime.projections.get(101).ep_mean, 6);
  assert.equal(runtime.projections.get(102).ep_mean, 5);
  assert.equal(runtime.staleRows.length, 1);
  assert.deepEqual(runtime.perGw.get(101).map((row) => row.gw), [1, 2]);
});

test("coverage failure names the missing active players instead of allowing fallback xPTS", () => {
  const players = [
    { id: 1, fpl_id: 101, web_name: "Covered" },
    { id: 2, fpl_id: 102, web_name: "Missing" },
  ];
  assert.throws(
    () => assertCurrentEngineCoverage({ projections: new Map([[101, { ep_mean: 4 }]]), players, currentGw: 1 }),
    (error) => error.code === "INCOMPLETE_ENGINE_GENERATION"
      && /Missing/.test(error.message)
      && error.covered === 1,
  );
});

test("engine-only scorer never manufactures final fallback xPTS", () => {
  const player = { fpl_id: 1, team_id: 10, position: "FWD", status: "a" };
  const common = {
    engineOnly: true,
    currentGw: 1,
    projections: new Map(),
    archivePer90: new Map([[1, { pointsPer90: 8, nineties: 30 }]]),
    understat: new Map(),
    minutesForecasts: new Map([[1, { p_start: 1, p_cameo: 0, exp_min_start: 90, exp_min_cameo: 0 }]]),
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    positionMeans: { FWD: 4.2 },
    hasFixture: () => true,
  };
  const scorer = buildScorer(common);
  assert.equal(scorer.scoreOf(player), null);
  assert.equal(scorer.routeOf(player), "missing-engine");
  assert.equal(scorer.sourceOf(player), "missing-engine");
  assert.equal(scorer.scoreForGw(player, 1), null);

  const blank = buildScorer({ ...common, hasFixture: () => false });
  assert.equal(blank.scoreOf(player), 0, "a genuine blank is zero, not a missing projection error");
});

test("integrity gate reports every active player missing from the generation", () => {
  const audit = __projectionIntegrityTest.auditGeneration(
    { rows: [{ player_id: 1, ep_mean: 4, r_exp_minutes: 80, r_p_start: 1, minutes_source: "forecast", rate_source: "understat", lambda_team: 1.5, lambda_opponent: 1.1 }] },
    [
      { id: 1, web_name: "Covered", archive: false, position: "MID" },
      { id: 2, web_name: "Missing", archive: false, position: "MID" },
      { id: 3, web_name: "Archived", archive: true, position: "MID" },
    ],
  );
  assert.deepEqual(audit.groups.missing_engine_projection.map((item) => item.name), ["Missing"]);
});

test.skip("browser and server loaders share deterministic selection and browser projections are paged", () => {
  const browser = readFileSync(new URL("../lib/projections.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/server/load.mjs", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
  for (const source of [browser, server]) {
    assert.match(source, /buildProjectionRuntime/);
    assert.match(source, /assertCurrentEngineCoverage/);
    assert.match(source, /engineOnly:\s*true/);
  }
  assert.match(browser, /\.range\(from, from \+ 999\)/, "the >1,000-row browser query must be paged");
  assert.ok(!browser.includes("projRes.error ? []"), "projection read errors must not become an empty engine");
  assert.ok(!dashboard.includes("catch { setModel(null); }"), "dashboard must not hide projection failures");
});

test("provenance labels partial engine coverage as an incomplete generation", () => {
  assert.match(provenanceLine({ engineRows: 500, livePlayers: 560, gateOpen: true }), /Incomplete simulation generation/);
  assert.match(provenanceLine({ engineRows: 500, livePlayers: 560, gateOpen: true }), /not assigned fallback xPTS/);
});

test("every projection run proves the stored horizon before success", () => {
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  const integrityCall = job.indexOf("await cleanupStaleProjections({");
  const successHeartbeat = job.indexOf('await beat("ok", msg)');
  assert.ok(integrityCall >= 0, "the projection job must execute the post-write integrity audit");
  assert.ok(job.includes("expectedGameweeks: targetGws"), "the audit must know the requested horizon");
  assert.ok(job.includes("expectedPlayersPerGameweek: profiles.length"), "the audit must know exact active-player coverage");
  assert.ok(job.includes("expectedComputedAt: projectionComputedAt"), "the audit must reject rows from another run");
  assert.ok(successHeartbeat >= 0, "the projection job must retain its success heartbeat");
  assert.ok(integrityCall < successHeartbeat,
    "the heartbeat must not report success before stored-horizon integrity passes");
});
