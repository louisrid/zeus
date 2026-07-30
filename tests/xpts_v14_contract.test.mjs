import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { applyLineupEvidence } from "../lib/engine/lineup_evidence.mjs";
import { currentGeneration } from "../lib/projection_generation.mjs";
import { buildBrief, GET as stableBriefGet } from "../lib/server/fpl_brief_api.mjs";
import { __projectionIntegrityTest } from "../jobs/projection_integrity_v14.mjs";

const cfg = { pStartCeiling: 0.98, earlySubShare: 0.17 };

for (const [name, team] of [
  ["Jacquet", "LIV"], ["Alisson", "LIV"], ["Palmer", "CHE"],
  ["Kovacic", "MCI"], ["Nunes", "MCI"],
]) {
  test(`${name}: a trusted predicted XI creates starter-level minutes without claiming certainty`, () => {
    const resolved = applyLineupEvidence({
      forecast: { p_start: 0.2, p_cameo: 0.2, p60_given_start: 0.68, exp_min_start: 72, exp_min_cameo: 12 },
      player: { web_name: name }, team: { short_name: team },
      lineups: { official: false, confidence: 0.75, clubs: { [team]: [name] } }, cfg,
    });
    assert.ok(resolved.p_start >= 0.83 && resolved.p_start < 0.98, resolved);
    assert.ok(resolved.exp_min_start >= 80, resolved);
    assert.equal(resolved.lineup_confidence, 0.75);
  });
}

test("Pau: one unofficial omission cannot crush an independent starter forecast", () => {
  const forecast = { p_start: 0.78, p_cameo: 0.08, p60: 0.72, p60_given_start: 0.9, exp_min_start: 85, exp_min_cameo: 10 };
  const resolved = applyLineupEvidence({
    forecast, player: { web_name: "Pau" }, team: { short_name: "AVL" },
    lineups: { official: false, confidence: 0.75, clubs: { AVL: ["Konsa", "Maatsen"] } }, cfg,
  });
  assert.deepEqual(
    { p_start: resolved.p_start, p_cameo: resolved.p_cameo, exp_min_start: resolved.exp_min_start },
    { p_start: forecast.p_start, p_cameo: forecast.p_cameo, exp_min_start: forecast.exp_min_start },
  );
  assert.equal(resolved.lineup_ignored_reason, "unofficial-omission");
});

test("Mitoma: only explicit unavailability can legitimately produce zero minutes", () => {
  const unavailable = applyLineupEvidence({
    forecast: { p_start: 0, p_cameo: 0, p60_given_start: 0, exp_min_start: 0, minutes_source: "unavailable" },
    player: { web_name: "Mitoma", status: "i", chance_of_playing_next_round: 0 }, team: { short_name: "BHA" },
    lineups: { official: false, confidence: 0.75, clubs: { BHA: ["Mitoma"] } }, cfg,
  });
  assert.equal(unavailable.p_start, 0);
  assert.equal(unavailable.lineup_ignored_reason, "explicitly-unavailable");

  const available = applyLineupEvidence({
    forecast: { p_start: 0.7, p_cameo: 0.1, p60_given_start: 0.85, exp_min_start: 82, minutes_source: "forecast" },
    player: { web_name: "Mitoma", status: "a", chance_of_playing_next_round: 100 }, team: { short_name: "BHA" },
    lineups: { official: false, confidence: 0.75, clubs: { BHA: ["Mitoma"] } }, cfg,
  });
  assert.ok(available.p_start >= 0.83, available);
});

test("official team sheets remain decisive", () => {
  const named = applyLineupEvidence({
    forecast: { p_start: 0.2, p_cameo: 0.2, p60_given_start: 0.7, exp_min_start: 70 },
    player: { web_name: "Starter" }, team: { short_name: "AAA" },
    lineups: { official: true, clubs: { AAA: ["Starter"] } }, cfg,
  });
  const omitted = applyLineupEvidence({
    forecast: { p_start: 0.9, p_cameo: 0.05, p60_given_start: 0.9, exp_min_start: 88 },
    player: { web_name: "Omitted" }, team: { short_name: "AAA" },
    lineups: { official: true, clubs: { AAA: ["Starter"] } }, cfg,
  });
  assert.equal(named.p_start, 0.98);
  assert.equal(omitted.p_start, 0);
});

test("the newest timestamp batch wins even when model_version is reused", () => {
  const result = currentGeneration([
    { player_id: 1, gw: 1, model_version: "same", computed_at: "2026-07-30T03:00:05Z" },
    { player_id: 2, gw: 1, model_version: "same", computed_at: "2026-07-30T02:59:56Z" },
    { player_id: 3, gw: 1, model_version: "same", computed_at: "2026-07-26T03:00:00Z" },
  ], 1);
  assert.deepEqual(result.rows.map((row) => row.player_id).sort(), [1, 2]);
  assert.deepEqual(result.staleRows.map((row) => row.player_id), [3]);
  assert.equal(result.cutoffExclusive, "2026-07-30T02:59:56.000Z");
});

test("the brief excludes stale rows and retains Open WebUI-compatible response fields", () => {
  const brief = buildBrief({
    gw: 1,
    projectionRows: [
      { player_id: 1, gw: 1, model_version: "same", computed_at: "2026-07-30T03:00:05Z", ep_mean: 6, r_p_start: 0.95, r_exp_minutes: 85, minutes_source: "lineup-starter" },
      { player_id: 2, gw: 1, model_version: "same", computed_at: "2026-07-26T03:00:00Z", ep_mean: 9 },
    ],
    playerRows: [
      { id: 1, web_name: "Current", team_id: 10, position: "MID" },
      { id: 2, web_name: "Stale", team_id: 10, position: "MID" },
    ],
    teamRows: [{ id: 10, short_name: "TST" }],
  });
  assert.deepEqual(brief.players.map((player) => player.name), ["Current"]);
  assert.equal(brief.stale_rows_excluded, 1);
  assert.equal(brief.status, "ok");
  assert.ok(Array.isArray(brief.essential_players));
  assert.deepEqual(brief.projections, brief.players);
});

test("integrity rejects every highlighted broken-row pattern", () => {
  const generation = {
    rows: [
      { player_id: 1, ep_mean: 1.1, r_exp_minutes: 82, r_p_start: 0.9, minutes_source: "lineup-starter", rate_source: "understat", lambda_team: 1.4, lambda_opponent: 1.2 },
      { player_id: 2, ep_mean: 1.2, r_exp_minutes: 86, r_p_start: 0.95, minutes_source: "lineup-starter", rate_source: "prior-positional", lambda_team: 1.6, lambda_opponent: 1.1 },
      { player_id: 3, ep_mean: 0, r_exp_minutes: 80, r_p_start: 0.9, minutes_source: "forecast", rate_source: "understat", lambda_team: 1.3, lambda_opponent: 1.3 },
      { player_id: 4, ep_mean: 3.5, r_exp_minutes: 82, r_p_start: 0.9, minutes_source: "forecast", rate_source: "understat", lambda_team: 1.4, lambda_opponent: 1.2 },
      { player_id: 5, ep_mean: 3.4, r_exp_minutes: 82, r_p_start: 0.9, minutes_source: "forecast", rate_source: "understat", lambda_team: 1.4, lambda_opponent: 1.2 },
    ],
  };
  const players = [
    { id: 1, web_name: "Pau", team_id: 10, position: "DEF", now_cost: 55 },
    { id: 2, web_name: "Alisson", team_id: 20, position: "GK", now_cost: 55 },
    { id: 3, web_name: "Broken starter", team_id: 30, position: "MID", now_cost: 60 },
    { id: 4, web_name: "Villa DEF 2", team_id: 10, position: "DEF", now_cost: 50 },
    { id: 5, web_name: "Villa DEF 3", team_id: 10, position: "DEF", now_cost: 50 },
  ];
  const audit = __projectionIntegrityTest.auditGeneration(generation, players);
  const kinds = new Set(audit.critical.map((failure) => failure.kind));
  assert.ok(kinds.has("high_minutes_below_125"));
  assert.ok(kinds.has("high_minute_goalkeepers_below_150"));
  assert.ok(kinds.has("unexplained_near_zero"));
  assert.ok(kinds.has("same_team_defender_outliers"));
});

test("stale deletion is bounded by computed_at, never by a reused model_version", () => {
  assert.equal(
    __projectionIntegrityTest.olderThanFilter(1, "2026-07-30T02:05:46.000Z"),
    "projections?gw=eq.1&computed_at=lt.2026-07-30T02%3A05%3A46.000Z",
  );
  assert.equal(__projectionIntegrityTest.untimedFilter(1), "projections?gw=eq.1&computed_at=is.null");
});

test("the existing comprehensive brief route is preserved and only wrapped on server failure", () => {
  const path = new URL("../app/api/brief/route.js", import.meta.url);
  assert.ok(existsSync(path), "the established /api/brief route is missing");
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes("Zeus v14 fallback: preserve the original FPL brief"));
  assert.ok(source.includes("legacyFplBriefGet"));
  assert.equal((source.match(/export async function GET/g) || []).length, 1);
  assert.ok(source.split("\n").length >= 40, "the original route was replaced by a thin wrapper");
  assert.ok(!/export\s+(?:async\s+function|const)\s+POST/.test(source), "the brief route is no longer read only");
  assert.ok(!source.includes("export const GET = handleGet"), "the broken v12 wrapper returned");
});

test("the fallback server does not import the browser loader and the projection job still uses engine lineup evidence", () => {
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  const fallback = readFileSync(new URL("../lib/server/fpl_brief_api.mjs", import.meta.url), "utf8");
  assert.ok(job.includes("lineupRolesOf") && job.includes("resolveMinutes"));
  assert.ok(fallback.includes("currentGeneration"));
  assert.ok(!fallback.includes('from "../projections'));
});

test("the direct fallback returns a usable 200 response with current projections", async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("projections?select=gw")) return new Response(JSON.stringify([{ gw: 1 }]), { status: 200 });
    if (value.includes("/projections?")) return new Response(JSON.stringify([
      { player_id: 1, gw: 1, model_version: "v", computed_at: "2026-07-30T03:00:05Z", ep_mean: 6.1, r_p_start: 0.95, r_exp_minutes: 86, minutes_source: "lineup-starter", rate_source: "understat", lambda_team: 2, lambda_opponent: 1 },
    ]), { status: 200 });
    if (value.includes("/players?")) return new Response(JSON.stringify([{ id: 1, web_name: "Player", team_id: 10, position: "MID", now_cost: 95 }]), { status: 200 });
    if (value.includes("/teams?")) return new Response(JSON.stringify([{ id: 10, short_name: "TST" }]), { status: 200 });
    return new Response("not found", { status: 404 });
  };
  try {
    const result = await stableBriefGet(new Request("https://zeus.test/api/brief?gw=1&format=json", { headers: { accept: "application/json" } }));
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.status, "ok");
    assert.equal(body.players[0].name, "Player");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test("maintenance installers are excluded from production workflow version checks", () => {
  const scoring = readFileSync(new URL("../tests/scoring.test.mjs", import.meta.url), "utf8");
  assert.ok(scoring.includes("maintenanceWorkflow"));
  assert.ok(scoring.includes("apply-(?:zeus|xpts)"));
  assert.ok(scoring.includes("restore-players-runtime"));
});
