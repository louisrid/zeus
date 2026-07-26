import test from "node:test";
import assert from "node:assert/strict";

test("blank and double gameweeks are detected exactly from the fixture list", async () => {
  const { blanksAndDoubles } = await import("../lib/data.js");
  const fixtures = [
    { gw: 30, home_team: 1, away_team: 2 }, { gw: 30, home_team: 3, away_team: 4 },
    { gw: 31, home_team: 1, away_team: 3 }, { gw: 31, home_team: 1, away_team: 4 }, // club 1 doubles, club 2 blanks
    { gw: 32, home_team: 1, away_team: 2 }, { gw: 32, home_team: 3, away_team: 4 },
  ];
  const out = blanksAndDoubles(fixtures, [1, 2, 3, 4]);
  assert.equal(out.length, 1, "only the irregular gameweek is reported");
  assert.equal(out[0].gw, 31);
  assert.deepEqual(out[0].doubles, [1]);
  assert.deepEqual(out[0].blanks, [2]);
});
