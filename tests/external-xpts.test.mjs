import test from "node:test";
import assert from "node:assert/strict";
import DATA from "../config/external-xpts-2026-27.mjs";
import {
  buildExternalProjectionModel,
  EXTERNAL_XPTS_GW_TO,
  matchExternalPlayers,
} from "../lib/external_xpts.mjs";

const player = (id, webName, own = 0, price = 5) => ({
  id,
  fpl_id: id,
  web_name: webName,
  name: webName,
  position: "MID",
  team_id: 1,
  team: "TST",
  own,
  price,
});

test("the complete manual export contains 555 players", () => {
  assert.equal(DATA.rows.length, 555);
});

test("Haaland and Saka match the screenshot calibration values exactly", () => {
  const haaland = player(1, "Haaland", 60, 15);
  const saka = player(2, "Saka", 40, 10);
  const model = buildExternalProjectionModel([haaland, saka], { currentGw: 1 });
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => model.scoreForGw(haaland, index + 1)),
    [7.5, 7.2, 8.2, 6.9, 7.8, 6.3, 8.1, 6.7]);
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => model.scoreForGw(saka, index + 1)),
    [5.2, 4.3, 4.7, 4.8, 4.6, 4.9, 4.7, 5.1]);
  assert.equal(model.minutesForGw(haaland, 1), 88);
  assert.equal(model.minutesForGw(saka, 1), 80);
});

test("minutes remain metadata and never rescale the imported xPTS", () => {
  const rice = player(3, "Rice", 20, 6.5);
  const model = buildExternalProjectionModel([rice], { currentGw: 1 });
  assert.equal(model.minutesForGw(rice, 1), 45);
  assert.equal(model.scoreForGw(rice, 1), 2.3);
  assert.equal(model.scoreForGw(rice, 3), 4.6);
});

test("duplicate display names keep only the highest source row and zero the rest", () => {
  const first = player(10, "Wilson", 25, 7.5);
  const second = player(11, "Wilson", 1, 4.5);
  const matched = matchExternalPlayers([first, second]);
  const model = buildExternalProjectionModel([first, second], { currentGw: 1 });
  assert.equal(model.scoreForGw(first, 1), 3.7);
  assert.equal(model.scoreForGw(second, 1), 0);
  assert.equal(matched.report.zeroed_duplicate_players, 1);
});

test("GW9-GW38 are disabled instead of falling back to ZEUS", () => {
  const haaland = player(1, "Haaland", 60, 15);
  const model = buildExternalProjectionModel([haaland], { currentGw: 1 });
  assert.equal(EXTERNAL_XPTS_GW_TO, 8);
  assert.equal(model.scoreForGw(haaland, 9), null);
  assert.equal(model.scoreForGw(haaland, 38), null);
});
