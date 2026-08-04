import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamFixtureOutlooks,
  decorateFixturePerspective,
  fixtureDifficultyCategory,
} from "../lib/fixture-difficulty.mjs";

test("the three fixture categories are deterministic and bounded", () => {
  assert.equal(fixtureDifficultyCategory(0), "EASY");
  assert.equal(fixtureDifficultyCategory(39), "EASY");
  assert.equal(fixtureDifficultyCategory(40), "MEDIUM");
  assert.equal(fixtureDifficultyCategory(59), "MEDIUM");
  assert.equal(fixtureDifficultyCategory(60), "HARD");
  assert.equal(fixtureDifficultyCategory(100), "HARD");
  assert.equal(fixtureDifficultyCategory(null), null);
});

test("fixture perspectives expose venue-aware strengths and attack/defence categories", () => {
  const team = {
    id: 1, short_name: "AAA", strength: 3,
    strength_attack_home: 5, strength_attack_away: 3,
    strength_defence_home: 4, strength_defence_away: 2,
  };
  const opponent = {
    id: 2, short_name: "BBB", strength: 5,
    strength_attack_home: 6, strength_attack_away: 4,
    strength_defence_home: 5, strength_defence_away: 3,
  };
  const home = decorateFixturePerspective({
    perspective: { team: "AAA", team_id: 1, opponent: "BBB", opponent_id: 2,
      difficulty: 35, attack_difficulty: 61, defence_difficulty: 42 },
    team, opponent, home: true, gw: 4,
  });
  const away = decorateFixturePerspective({
    perspective: { team: "AAA", team_id: 1, opponent: "BBB", opponent_id: 2,
      difficulty: 65, attack_difficulty: 72, defence_difficulty: 55 },
    team, opponent, home: false, gw: 4,
  });
  assert.equal(home.assessed_team, "AAA");
  assert.equal(home.opponent, "BBB");
  assert.equal(home.venue, "H");
  assert.equal(home.category, "EASY");
  assert.equal(home.attack_category, "HARD");
  assert.equal(home.defence_category, "MEDIUM");
  assert.equal(home.strength_inputs.opponent_attack_strength, 4, "the away opponent rating is used");
  assert.equal(away.strength_inputs.opponent_attack_strength, 6, "the home opponent rating is used");
  assert.ok(away.numeric_value > home.numeric_value);
  assert.notEqual(home.strength_inputs.overall_venue_adjustment, away.strength_inputs.overall_venue_adjustment);
});

test("team outlooks aggregate exact fixture perspectives", () => {
  const fixtures = [
    { home_team_view: { assessed_team: "AAA", assessed_team_id: 1, opponent: "BBB", opponent_id: 2,
      gw: 1, venue: "H", category: "EASY", numeric_value: 30,
      attack_category: "EASY", attack_numeric_value: 25,
      defence_category: "MEDIUM", defence_numeric_value: 45, strength_inputs: {} },
      away_team_view: { assessed_team: "BBB", assessed_team_id: 2, opponent: "AAA", opponent_id: 1,
        gw: 1, venue: "A", category: "HARD", numeric_value: 70,
        attack_category: "MEDIUM", attack_numeric_value: 55,
        defence_category: "HARD", defence_numeric_value: 75, strength_inputs: {} } },
    { home_team_view: { assessed_team: "AAA", assessed_team_id: 1, opponent: "CCC", opponent_id: 3,
      gw: 2, venue: "H", category: "MEDIUM", numeric_value: 50,
      attack_category: "EASY", attack_numeric_value: 35,
      defence_category: "HARD", defence_numeric_value: 65, strength_inputs: {} },
      away_team_view: null },
  ];
  const outlooks = buildTeamFixtureOutlooks(fixtures);
  const aaa = outlooks.find((row) => row.assessed_team === "AAA");
  assert.equal(aaa.fixture_count, 2);
  assert.deepEqual(aaa.category_counts, { EASY: 1, MEDIUM: 1, HARD: 0 });
  assert.equal(aaa.average_numeric_value, 40);
  assert.equal(aaa.average_attack_numeric_value, 30);
  assert.equal(aaa.average_defence_numeric_value, 55);
});
