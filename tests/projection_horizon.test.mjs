import test from "node:test";
import assert from "node:assert/strict";
import { normaliseProjectionHorizon, selectProjectionHorizon } from "../lib/projection_horizon.mjs";

const liveTeams = new Set(Array.from({ length: 20 }, (_, index) => index + 1));
const fixture = (gw, extra = {}) => ({
  id: gw,
  fpl_id: gw,
  gw,
  home_team: ((gw - 1) % 10) + 1,
  away_team: ((gw - 1) % 10) + 11,
  finished: false,
  season: "2026-27",
  competition: "PL",
  ...extra,
});

test("projection horizon always keeps the eight-gameweek release minimum", () => {
  assert.equal(normaliseProjectionHorizon(undefined), 8);
  assert.equal(normaliseProjectionHorizon("not-a-number"), 8);
  assert.equal(normaliseProjectionHorizon(4), 8);
  assert.equal(normaliseProjectionHorizon(12), 12);
});

test("null-season current fixtures cannot silently collapse the release to GW1", () => {
  const allFixtures = Array.from({ length: 8 }, (_, index) => fixture(index + 1, { season: null }));
  allFixtures.push(fixture(1, { id: 999, season: "2025-26", finished: true }));
  const gameweeks = Array.from({ length: 38 }, (_, index) => ({ gw: index + 1, finished: false }));

  const result = selectProjectionHorizon({ allFixtures, gameweeks, liveTeamIds: liveTeams, horizon: 8 });
  assert.deepEqual(result.targetGws, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.fixtures.length, 8);
  assert.equal(result.currentFixtures.some((row) => row.season === "2025-26"), false);
});

test("the horizon fails clearly instead of pretending fewer than eight gameweeks are complete", () => {
  const allFixtures = Array.from({ length: 7 }, (_, index) => fixture(index + 1));
  const gameweeks = Array.from({ length: 7 }, (_, index) => ({ gw: index + 1, finished: false }));
  assert.throws(
    () => selectProjectionHorizon({ allFixtures, gameweeks, liveTeamIds: liveTeams, horizon: 8 }),
    /projection horizon incomplete: found 7 upcoming gameweek\(s\), need 8/,
  );
});

test("a gameweek without any current fixture blocks projection generation", () => {
  const allFixtures = Array.from({ length: 8 }, (_, index) => fixture(index + 1))
    .filter((row) => row.gw !== 5);
  const gameweeks = Array.from({ length: 8 }, (_, index) => ({ gw: index + 1, finished: false }));
  assert.throws(
    () => selectProjectionHorizon({ allFixtures, gameweeks, liveTeamIds: liveTeams, horizon: 8 }),
    /projection fixtures missing for GW5/,
  );
});
