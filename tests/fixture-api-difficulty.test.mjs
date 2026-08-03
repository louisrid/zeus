import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFixturePayload } from "../lib/server/fpl_brief_api.mjs";

const teams = [
  {
    id: 1, name: "Alpha", short_name: "AAA", strength: 2,
    strength_attack_home: 2, strength_attack_away: 1,
    strength_defence_home: 4, strength_defence_away: 3,
    archive: false,
  },
  {
    id: 2, name: "Beta", short_name: "BBB", strength: 5,
    strength_attack_home: 5, strength_attack_away: 4,
    strength_defence_home: 2, strength_defence_away: 1,
    archive: false,
  },
];

const fixtureRows = [{
  id: 99, fpl_id: 999, gw: 3, home_team: 1, away_team: 2,
  kickoff_utc: "2026-08-29T14:00:00Z", finished: false,
  season: "2026-27", competition: "PL", home_goals: null, away_goals: null,
}];

test("fixture payload keeps both teams and exposes numeric overall, attack and defence difficulty", () => {
  const [fixture] = buildFixturePayload({ fixtureRows, teamRows: teams });
  assert.equal(fixture.home_team, "AAA");
  assert.equal(fixture.away_team, "BBB");
  for (const key of [
    "home_team_difficulty", "away_team_difficulty",
    "home_team_attack_difficulty", "away_team_attack_difficulty",
    "home_team_defence_difficulty", "away_team_defence_difficulty",
  ]) {
    assert.equal(Number.isFinite(fixture[key]), true, `${key} must be numeric`);
    assert.ok(fixture[key] >= 0 && fixture[key] <= 100, `${key} must stay on the 0-100 scale`);
  }
  assert.equal(fixture.home_team_view.venue, "H");
  assert.equal(fixture.away_team_view.venue, "A");
  assert.equal(fixture.home_team_view.opponent, "BBB");
  assert.equal(fixture.away_team_view.opponent, "AAA");
});

test("the Letta fixture view supports team and gameweek filters without touching xPTS", () => {
  const source = readFileSync("lib/server/fpl_brief_api.mjs", "utf8");
  assert.match(source, /view === "fixtures"/);
  assert.match(source, /params\.team \?\? params\.club \?\? params\.clubs/);
  assert.match(source, /fixtureGwFrom/);
  assert.match(source, /difficulty_scale: "0 = easiest, 100 = hardest"/);
  assert.match(source, /one_team_window: "\/api\/brief\?view=fixtures&team=MCI&gw_from=1&gw_to=8"/);
  assert.match(source, /buildExternalProjectionRows/);
});
