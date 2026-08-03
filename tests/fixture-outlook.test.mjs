import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFixtureOutlook,
  canonicalTeamId,
  fixtureEase,
  fixtureRatingBasis,
  nextFixturesForTeam,
} from "../lib/fixture-outlook.mjs";

const teams = {
  1: { id: 1, short_name: "AAA", strength: 50, strength_attack_home: 55, strength_attack_away: 50, strength_defence_home: 60, strength_defence_away: 55 },
  2: { id: 2, short_name: "BBB", strength: 55, strength_attack_home: 95, strength_attack_away: 90, strength_defence_home: 15, strength_defence_away: 10 },
  3: { id: 3, short_name: "CCC", strength: 50, strength_attack_home: 50, strength_attack_away: 45, strength_defence_home: 55, strength_defence_away: 50 },
  4: { id: 4, short_name: "DDD", strength: 55, strength_attack_home: 10, strength_attack_away: 15, strength_defence_home: 95, strength_defence_away: 90 },
};

const fixtures = [
  { fpl_id: 20, gw: 2, home_team: "3", away_team: 4, kickoff_utc: "2026-08-20T18:00:00Z" },
  { fpl_id: 10, gw: 1, home_team: "1", away_team: 2, kickoff_utc: "2026-08-10T18:00:00Z" },
];

test("fixture IDs are canonicalised so numeric and string team ids load the same run", () => {
  assert.equal(canonicalTeamId("01"), "1");
  const run = nextFixturesForTeam(fixtures, teams, 1, 5);
  assert.equal(run.length, 1);
  assert.deepEqual(run[0], {
    opp: "BBB", oppId: 2, home: true, gw: 1,
    kickoff: "2026-08-10T18:00:00Z", fixtureId: 10,
  });
  assert.deepEqual(nextFixturesForTeam(fixtures, teams, "3", 5).map((item) => item.opp), ["DDD"]);
});

test("attack and defence views use different opponent components and can rank clubs differently", () => {
  const attack = buildFixtureOutlook({ fixtures, teamById: teams, mode: "ATTACK", gameweeks: 5 });
  const defence = buildFixtureOutlook({ fixtures, teamById: teams, mode: "DEFENCE", gameweeks: 5 });
  assert.equal(attack.rows[0].club.short_name, "AAA");
  assert.equal(defence.rows[0].club.short_name, "CCC");
  assert.notDeepEqual(attack.rows.map((row) => row.club.short_name), defence.rows.map((row) => row.club.short_name));
  assert.match(attack.basis, /defensive/);
  assert.match(defence.basis, /attacking/);
});

test("home and away change ease without reversing the meaning of stronger opponents", () => {
  const basis = fixtureRatingBasis(teams, "ATTACK");
  const home = fixtureEase({ mode: "ATTACK", fixture: { home: true }, opponent: teams[2], basis });
  const away = fixtureEase({ mode: "ATTACK", fixture: { home: false }, opponent: teams[2], basis });
  assert.ok(home.ease > away.ease);
  const hard = fixtureEase({ mode: "ATTACK", fixture: { home: true }, opponent: teams[4], basis });
  assert.ok(home.ease > hard.ease);
});

test("shared scale is used only as a safe fallback when component data is absent", () => {
  const sparse = { 1: { id: 1, short_name: "AAA" }, 2: { id: 2, short_name: "BBB" } };
  const scale = { difficultyOf: (_id, home) => ({ difficulty: home ? 30 : 50, basis: "club strength" }) };
  const result = buildFixtureOutlook({
    fixtures: [{ gw: 1, home_team: 1, away_team: 2 }],
    teamById: sparse,
    mode: "DEFENCE",
    gameweeks: 5,
    scale,
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find((row) => row.club.id === 1).ease, 70);
  assert.equal(result.rows.find((row) => row.club.id === 2).ease, 50);
});

test("fixture outlook source exposes only the two requested views and a truthful empty state", () => {
  const source = readFileSync(new URL("../components/FixtureOutlook.jsx", import.meta.url), "utf8");
  const dataSource = readFileSync(new URL("../lib/data.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
  assert.match(source, /EASIEST FOR ATTACK/);
  assert.match(source, /EASIEST FOR DEFENCE/);
  assert.match(source, /No upcoming fixtures found in the current gameweek window/);
  assert.doesNotMatch(source, /OVERALL|Worst fixtures|Fixtures not published yet/);
  assert.match(source, /GW\{fixture\.gw\} \{fixture\.opp\} \{fixture\.home \? "H" : "A"\}/);
  assert.match(source, /EASE/);
  assert.match(dataSource, /nextFixturesForTeam/);
  assert.doesNotMatch(dashboard, /FixtureOutlook|Easiest fixtures ahead/, "the dashboard widget is intentionally removed");
});
