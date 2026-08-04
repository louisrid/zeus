import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the Squad page uses one shared exact-range optimiser and atomic plan write", () => {
  const source = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(source, /GameweekRange/);
  assert.match(source, /SquadRangeSummary/);
  assert.match(source, /optimiseSavedPlanRange/);
  assert.match(source, /applyOptimisedRangeToPlan/);
  assert.match(source, /OPTIMISE GW/);
  assert.match(source, /gwFrom/);
  assert.match(source, /gwTo/);
  assert.match(source, /setGw\(from\)/);
});

test("the saved-squad brief exposes exact ranges and simulate_gw", () => {
  const route = readFileSync("app/api/brief/route.js", "utf8");
  const summary = readFileSync("lib/server/squad-brief.mjs", "utf8");
  assert.match(route, /gw_from/);
  assert.match(route, /gw_to/);
  assert.match(route, /simulate_gw/);
  assert.match(summary, /summariseSavedPlanRange/);
  assert.match(summary, /range_total/);
  assert.match(summary, /range_simulation/);
});

test("the final Letta prompt contains all permanent routing prohibitions and smoke tests", () => {
  const prompt = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  for (const marker of [
    "get_fpl_squad",
    "get_saved_fpl_squads",
    "simulate_gw",
    "predicted-lineup gate",
    "raw_imported_xpts",
    "EASY",
    "MEDIUM",
    "HARD",
    "durable memory",
    "Team 4812",
    "GW9",
  ]) assert.ok(prompt.includes(marker), `missing ${marker}`);
  assert.match(prompt, /Never substitute the old local ZEUS projection model/);
  assert.match(prompt, /Do not call `get_fpl_squad` or `get_saved_fpl_squads`/);
});

test("the structured fixture API uses the shared three-category outlook contract", () => {
  const api = readFileSync("lib/server/fpl_brief_api.mjs", "utf8");
  assert.match(api, /decorateFixturePerspective/);
  assert.match(api, /buildTeamFixtureOutlooks/);
  assert.match(api, /outlook\.assessed_team/);
  assert.match(api, /outlook\.assessed_team_id/);
  assert.match(api, /category_scale/);
  assert.match(api, /home_team_category/);
  assert.match(api, /home_team_attack_category/);
  assert.match(api, /home_team_defence_category/);
});


test("Builder and theoretical API share the same chip-aware full-squad range solver", () => {
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const route = readFileSync("app/api/optimise/route.js", "utf8");
  for (const source of [builder, route]) assert.match(source, /buildSquadForRange/);
  assert.match(builder, /chipForGameweek/);
  assert.match(builder, /mergeWeeklyDecisions/);
  assert.match(builder, /BUILD SQUAD and IMPROVE are the same/);
  assert.match(route, /parsed\.mode === "squad" \|\| parsed\.mode === "benchboost"/);
});
