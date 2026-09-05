// The external expected-points import, and the identity contract underneath it.
//
// This file used to build fake players and rely on the display name to find their row. That is precisely
// the mechanism that failed in production: three players are called Wilson, two are called Fletcher, and
// a player who changes club keeps his name while his club changes underneath him. The import now carries
// the official FPL element id on every row and identity is resolved by that id, so the tests below use
// real ids and assert the behaviour that name matching could never guarantee.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import DATA from "../config/external-xpts-2026-27.mjs";
import {
  buildExternalProjectionModel,
  EXTERNAL_XPTS_GW_FROM,
  EXTERNAL_XPTS_GW_TO,
  EXTERNAL_XPTS_STORED_GW_TO,
  matchExternalPlayers,
} from "../lib/external_xpts.mjs";
import { buildLineupGate, LINEUP_GATE_APPLIES_FROM, LINEUP_GATE_APPLIES_TO } from "../lib/lineup-xpts.mjs";
import LINEUP_CONFIG from "../lib/server/lineups-config.generated.mjs";

const SNAP = JSON.parse(readFileSync("tests/fpl-players.json", "utf8"));
const at = (id) => SNAP.players.find((p) => p.fpl_id === id);
const rowFor = (id) => DATA.rows.find((r) => r.fpl_id === id);

// Real ids, so a rename in the source cannot quietly repoint a test at a different footballer.
const HAALAND = 411;
const SAKA = 12;
const RICE = 13;
const WILSONS = [108, 172, 260];
const FLETCHERS = [434, 438];

const modelFor = (ids, options = {}) =>
  buildExternalProjectionModel(ids.map(at), { currentGw: 1, ...options });

test("the export covers every current FPL player across the whole season", () => {
  assert.equal(DATA.rows.length, SNAP.players.length,
    "one row per FPL player, so nobody is silently absent");
  assert.equal(EXTERNAL_XPTS_GW_FROM, 1);
  /* The served horizon is a config value that moves when a fresh export is imported, so pinning the
     number here means every refresh turns the suite red for no reason. What must hold is that it is a
     sane window inside the stored season and that the gate covers all of it. */
  assert.ok(EXTERNAL_XPTS_GW_TO >= 1 && EXTERNAL_XPTS_GW_TO <= 38,
    `the served horizon must sit inside the season, got GW${EXTERNAL_XPTS_GW_TO}`);
  assert.equal(EXTERNAL_XPTS_STORED_GW_TO, 38, "while the file stores the whole season for later");
  for (const row of DATA.rows) {
    assert.equal(row.xpts.length, 38, `${row.name} must carry 38 gameweeks`);
    assert.ok(Number.isFinite(row.fpl_id), `${row.name} must carry an FPL id`);
  }
  const ids = DATA.rows.map((row) => row.fpl_id);
  assert.equal(new Set(ids).size, ids.length, "no id may appear twice");
});

test("every row is keyed by id, so nothing is dropped as a duplicate name", () => {
  const report = matchExternalPlayers(SNAP.players).report;
  assert.equal(report.identity, "fpl_id");
  assert.equal(report.matched_players, SNAP.players.length);
  assert.equal(report.zeroed_duplicate_players, 0,
    "id matching cannot produce a duplicate-name collision");
  assert.equal(report.zeroed_unmatched_players, 0);
  assert.deepEqual(report.unmatched_source_rows, [],
    "no imported row is left without a player to attach to");
});

test("players who share a display name keep separate projections", () => {
  // Three Wilsons at three clubs. Under name matching one kept the row and the other two were zeroed.
  const model = modelFor(WILSONS);
  const scores = WILSONS.map((id) => model.scoreForGw(at(id), 1));
  assert.equal(new Set(scores).size, 3, "three Wilsons, three different projections");
  for (const score of scores) assert.ok(score > 0, "and none zeroed merely for sharing a name");

  const fletchers = modelFor(FLETCHERS);
  assert.notEqual(fletchers.scoreForGw(at(FLETCHERS[0]), 1), fletchers.scoreForGw(at(FLETCHERS[1]), 1),
    "the two Manchester United Fletchers are different players");
});

test("imported values are served unchanged when no gate is applied", () => {
  const model = modelFor([HAALAND, SAKA]);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => model.scoreForGw(at(HAALAND), index + 1)),
    rowFor(HAALAND).xpts.slice(0, 8),
    "the model returns the imported series, not a recomputed one");
  assert.equal(model.minutesForGw(at(HAALAND), 1), rowFor(HAALAND).display_minutes);
});

test("minutes remain metadata and never rescale the imported xPTS", () => {
  const model = modelFor([RICE]);
  assert.equal(model.minutesForGw(at(RICE), 1), rowFor(RICE).display_minutes);
  assert.equal(model.scoreForGw(at(RICE), 1), rowFor(RICE).xpts[0],
    "a reduced minutes figure does not scale the points down");
  assert.equal(model.scoreForGw(at(RICE), 3), rowFor(RICE).xpts[2]);
});

test("points stop where the projection stops, and the rest is held in reserve", () => {
  const model = modelFor([HAALAND]);
  for (let gw = 1; gw <= EXTERNAL_XPTS_GW_TO; gw += 1) {
    assert.equal(model.scoreForGw(at(HAALAND), gw), rowFor(HAALAND).xpts[gw - 1],
      `GW${gw} is served from the import`);
  }
  /* Derived, never literal. GW20 and GW38 were pinned here as beyond the horizon; once the horizon was
     extended to the whole season they were inside it and a correct import turned the suite red. */
  for (const gw of [EXTERNAL_XPTS_GW_TO + 1, EXTERNAL_XPTS_GW_TO + 5, 39]) {
    assert.equal(model.scoreForGw(at(HAALAND), gw), null,
      `GW${gw} is beyond the served horizon and must return null, not a number`);
  }
  assert.equal(model.scoreForGw(at(HAALAND), 0), null);
});

test("the stored season is intact, so extending needs no reimport", () => {
  // The capacity to go further is the point: every value out to GW38 is already here, unserved.
  for (const row of DATA.rows) {
    assert.equal(row.xpts.length, EXTERNAL_XPTS_STORED_GW_TO, `${row.name} stores the full season`);
  }
  const haaland = rowFor(HAALAND);
  assert.ok(haaland.xpts[37] > 0, "GW38 is a real stored value, not a placeholder zero");
  assert.ok(EXTERNAL_XPTS_GW_TO <= EXTERNAL_XPTS_STORED_GW_TO,
    "the served horizon can never exceed what is stored");
  // Raising the horizon is one number in the config file, not a code change.
  const config = readFileSync("config/external-xpts-2026-27.mjs", "utf8");
  assert.match(config, /"gw_served_to":\s*\d+/, "the served horizon is a single editable field");
  assert.match(config, /TO EXTEND THE PROJECTION/, "and the file says how to change it");
});

test("the predicted-lineup gate zeroes non-starters, but only inside its own window", () => {
  const gate = buildLineupGate({ clubs: LINEUP_CONFIG.clubs, players: SNAP.players, teams: SNAP.teams });
  assert.equal(gate.active, true, "twenty published elevens must activate the gate");
  const model = buildExternalProjectionModel(SNAP.players, {
    currentGw: 1, lineupStartingIds: gate.startingIds, lineupGateReport: gate.report,
  });

  /* The non-starter is found in the data rather than named. Naming one meant the test broke every time
     the source republished a team sheet: Saka was pinned here as the example non-starter, the next
     refresh picked him, and a correct import turned the suite red. Who is benched is precisely the
     thing that changes week to week, so the test asks the gate who it benched. */
  const benched = SNAP.players.find((player) =>
    !gate.startingIds.has(player.fpl_id) && rowFor(player.fpl_id) && rowFor(player.fpl_id).xpts[0] > 0);
  assert.ok(benched, "at least one imported player must be left out of the published elevens");
  for (let gw = LINEUP_GATE_APPLIES_FROM; gw <= LINEUP_GATE_APPLIES_TO; gw += 1) {
    assert.equal(model.scoreForGw(at(benched.fpl_id), gw), 0,
      `GW${gw} must be zero for ${benched.web_name}, who is not in his club's published eleven`);
    assert.equal(model.startProbForGw(at(benched.fpl_id), gw), 0);
    assert.equal(model.rawScoreForGw(at(benched.fpl_id), gw), rowFor(benched.fpl_id).xpts[gw - 1],
      "while the raw imported value is preserved for audit");
  }
  /* The gate is tied to the served horizon in lib/lineup-xpts.mjs, so the two cannot drift apart. A
     player his club leaves out scores zero for every week that is served, and gets his points back when a
     fresh predicted-line-up snapshot puts him back in the eleven. Refreshing the line-ups is what moves
     it, which is the scout-lineups-pull job's whole purpose. */
  /* The gate covers the gameweek its team sheet is about, not every week that is served. Requiring it to
     span the horizon was defensible at eight weeks and became a bug at thirty-eight: one snapshot names
     about two hundred and twenty players, so spanning it zeroed the other four hundred-odd for the whole
     season. What must hold is that the gate never claims a week it has no team news for. */
  assert.ok(LINEUP_GATE_APPLIES_TO <= EXTERNAL_XPTS_GW_TO,
    "the gate must not claim a week beyond what is served");
  assert.ok(LINEUP_GATE_APPLIES_FROM >= 1 && LINEUP_GATE_APPLIES_TO >= LINEUP_GATE_APPLIES_FROM,
    "and it must be a real window");
  assert.equal(model.scoreForGw(at(benched.fpl_id), EXTERNAL_XPTS_GW_TO + 1), null,
    "beyond the served horizon nothing is returned at all");

  // A named starter keeps his imported value throughout.
  assert.equal(gate.startingIds.has(HAALAND), true);
  assert.equal(model.scoreForGw(at(HAALAND), 1), rowFor(HAALAND).xpts[0]);
  assert.equal(model.startProbForGw(at(HAALAND), 1), 1);
});
