import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFixturePayload, buildSeasonProjectionRows } from "../lib/server/fpl_brief_api.mjs";
import { resolveMinutes } from "../lib/minutes_resolved.mjs";

test("full season workflow requests and verifies GW1-GW38", () => {
  const workflow = readFileSync(new URL("../.github/workflows/projections-run.yml", import.meta.url), "utf8");
  assert.match(workflow, /PROJECTION_GWS: "38"/);
  assert.match(workflow, /verify_full_season_fixtures\.mjs/);
  assert.match(workflow, /verify_projection_horizon_report\.mjs projection-horizon-report\.json 38/);
});

test("fixture and season projection API payloads preserve every requested row", () => {
  const teams = [{ id: 1, short_name: "MUN" }, { id: 2, short_name: "ARS" }];
  const fixtures = buildFixturePayload({ fixtureRows: [{ id: 7, fpl_id: 70, gw: 2, home_team: 1, away_team: 2, season: "2026-27", competition: "PL" }], teamRows: teams });
  assert.deepEqual(fixtures[0], { fixture_id: 7, fpl_fixture_id: 70, gw: 2, kickoff_utc: null, home_team: "MUN", away_team: "ARS", home_team_id: 1, away_team_id: 2, finished: false, home_goals: null, away_goals: null, season: "2026-27", competition: "PL" });
  const projections = buildSeasonProjectionRows({
    projectionRows: [{ player_id: 10, gw: 2, ep_mean: 4.2, r_exp_minutes: 82, r_p_start: .9, computed_at: "2026-08-02T00:00:00Z", quantiles: { diagnostics: { resolved_team_id: 1 } } }],
    playerRows: [{ id: 10, fpl_id: 99, web_name: "Example", team_id: 1, position: "DEF" }], teamRows: teams,
  });
  assert.equal(projections.length, 1);
  assert.equal(projections[0].gw, 2);
  assert.equal(projections[0].xpts, 4.2);
});

test("current predicted starters carry forward at full strength with no decay", () => {
  const baseDef = { position: "DEF", p_start: .35, p_cameo: .2, p60_given_start: .9, exp_min_start: 82, exp_min_cameo: 12 };
  const gw2 = resolveMinutes({ base: baseDef, lineup: "carryStarter", confidence: 1, weeksAhead: 1 });
  const gw20 = resolveMinutes({ base: baseDef, lineup: "carryStarter", confidence: 1, weeksAhead: 19 });
  assert.equal(gw2.p_start, 1);
  assert.equal(gw20.p_start, 1);
  assert.equal(gw2.p_start, gw20.p_start);
  const keeper = resolveMinutes({ base: { ...baseDef, position: "GKP", p_start: .2 }, lineup: "carryStarter", confidence: .85, weeksAhead: 30 });
  assert.equal(keeper.p_start, .85);
});
