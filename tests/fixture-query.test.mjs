import test from "node:test";
import assert from "node:assert/strict";
import { buildFixtureQueryResult, parseFixtureQueryParams } from "../lib/fixture-query.mjs";

const teams = [
  { id: 1, short_name: "MUN", name: "Manchester United" },
  { id: 2, short_name: "ARS", name: "Arsenal" },
  { id: 3, short_name: "LIV", name: "Liverpool" },
];
const fixtures = [
  { id: 10, gw: 1, home_team: 1, away_team: 2, season: "2026-27", competition: "PL", kickoff_utc: "2026-08-10T12:00:00Z" },
  { id: 11, gw: 1, home_team: 3, away_team: 1, season: "2026-27", competition: "PL", kickoff_utc: "2026-08-11T12:00:00Z" },
  { id: 12, gw: 2, home_team: 2, away_team: 3, season: "2026-27", competition: "PL", kickoff_utc: "2026-08-17T12:00:00Z" },
];

test("fixture query flags doubles and blanks across GW1-GW38", () => {
  const result = buildFixtureQueryResult(
    { fixtureRows: fixtures, teamRows: teams },
    parseFixtureQueryParams(new URLSearchParams("gw_from=1&gw_to=2&clubs=MUN,ARS")),
  );
  assert.equal(result.complete, true);
  assert.equal(result.fixtures.length, 3);
  assert.equal(result.club_gameweeks.find((row) => row.club === "MUN" && row.gw === 1).double, true);
  assert.equal(result.club_gameweeks.find((row) => row.club === "MUN" && row.gw === 2).blank, true);
  assert.equal(result.fixtures.find((row) => row.fixture_id === 10).home_double, true);
});

test("club filtering keeps fixtures involving the requested club", () => {
  const result = buildFixtureQueryResult(
    { fixtureRows: fixtures, teamRows: teams },
    { gwFrom: 1, gwTo: 2, clubs: ["ARS"] },
  );
  assert.deepEqual(result.fixtures.map((row) => row.fixture_id), [10, 12]);
});
