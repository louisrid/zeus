// The three fixture tags must follow the gameweek range, not the calendar.
//
// They previously always showed the next three from today, so selecting GW5 moved every projection in
// the table while the opponents stayed on GW1. That invites reading a GW5 number against a GW1 opponent,
// which is a mistake the table should make impossible rather than merely unlikely.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextFixturesForTeam } from "../lib/fixture-outlook.mjs";
import { nextFixtures } from "../lib/data.js";

const TEAMS = { 1: { id: 1, short_name: "ARS" }, 2: { id: 2, short_name: "CHE" },
  3: { id: 3, short_name: "LIV" }, 4: { id: 4, short_name: "MCI" } };
const FIXTURES = [
  { gw: 1, home_team: 1, away_team: 2, kickoff_utc: "2026-08-21T19:00:00Z" },
  { gw: 2, home_team: 3, away_team: 1, kickoff_utc: "2026-08-28T19:00:00Z" },
  { gw: 3, home_team: 1, away_team: 4, kickoff_utc: "2026-09-04T19:00:00Z" },
  { gw: 4, home_team: 2, away_team: 1, kickoff_utc: "2026-09-11T19:00:00Z" },
  { gw: 5, home_team: 1, away_team: 3, kickoff_utc: "2026-09-18T19:00:00Z" },
  { gw: 6, home_team: 4, away_team: 1, kickoff_utc: "2026-09-25T19:00:00Z" },
];
const gws = (from) => nextFixturesForTeam(FIXTURES, TEAMS, 1, 3, from).map((f) => f.gw);

test("the run starts at the chosen gameweek and takes the two after it", () => {
  assert.deepEqual(gws(1), [1, 2, 3]);
  assert.deepEqual(gws(2), [2, 3, 4]);
  assert.deepEqual(gws(3), [3, 4, 5]);
  assert.deepEqual(gws(4), [4, 5, 6]);
});

test("omitting the start keeps the old behaviour for surfaces that mean next up from now", () => {
  assert.deepEqual(gws(null), [1, 2, 3], "no start given means no filtering");
  assert.deepEqual(gws(undefined), [1, 2, 3]);
  assert.deepEqual(nextFixtures(FIXTURES, TEAMS, 1, 3).map((f) => f.gw), [1, 2, 3],
    "the data.js wrapper must default the same way, or the dashboard and builder change silently");
});

test("near the end of the season it returns what exists rather than padding", () => {
  assert.deepEqual(gws(5), [5, 6], "two left is two tags, not two tags and a blank");
  assert.deepEqual(gws(6), [6]);
  assert.deepEqual(gws(7), [], "past the data is empty, not the first three again");
});

test("the opponent and venue travel with the gameweek", () => {
  const [first] = nextFixturesForTeam(FIXTURES, TEAMS, 1, 3, 4);
  assert.equal(first.gw, 4);
  assert.equal(first.opp, "CHE");
  assert.equal(first.home, false, "Arsenal are away at Chelsea in GW4 and the tag must say so");
});

test("the players table passes its range start through", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  assert.match(src, /nextFixtures\(core\.fixtures, core\.teamById, p\.team_id, 3, gwFrom\)/,
    "the tags must be built from the selected start gameweek");
  assert.match(src, /\[core, gwFrom\]/,
    "and recompute when it changes, or the tags freeze on the first render");
});
