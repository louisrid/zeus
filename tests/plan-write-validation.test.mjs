import test from "node:test";
import assert from "node:assert/strict";
import { validatePlanWrite } from "../lib/plan-write-validation.mjs";

const positions = ["GKP","GKP","DEF","DEF","DEF","DEF","DEF","MID","MID","MID","MID","MID","FWD","FWD","FWD"];
const completeBase = positions.map((position, index) => ({
  fpl_id: index + 1,
  position,
  team_id: index + 1,
  price: 5,
  purchasePrice: 5,
  starting: index < 11,
}));
const validWeek = {
  transfers: [],
  startingIds: [1,3,4,5,8,9,10,11,12,13,14],
  benchOrder: [2,6,7,15],
  structure: "3-5-2",
  captain: 13,
  vice: 14,
  chip: null,
};

test("allows incomplete ordinary plans and chip-only future weeks", () => {
  const result = validatePlanWrite({
    base: completeBase.slice(0, 4),
    weeks: { "2": { transfers: [], chip: "benchboost" } },
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("accepts a complete weekly lineup after a valid transfer", () => {
  const weeks = {
    "2": {
      transfers: [{ out: 12, in: 16, position: "MID", team_id: 16, price: 5 }],
      startingIds: [1,3,4,5,8,9,10,11,16,13,14],
      benchOrder: [2,6,7,15],
      structure: "3-5-2",
      captain: 13,
      vice: 14,
      chip: null,
    },
  };
  assert.deepEqual(validatePlanWrite({ base: completeBase, weeks }), { ok: true, errors: [] });
});

test("rejects zero-based gameweek keys", () => {
  const result = validatePlanWrite({ base: completeBase, weeks: { "0": validWeek } });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /never "0"/);
});

test("rejects overlap, incomplete roles, wrong formation and non-starting captain", () => {
  const broken = {
    ...validWeek,
    startingIds: validWeek.startingIds.slice(0, 10),
    benchOrder: [2,3,6,7],
    structure: "4-4-2",
    captain: 2,
  };
  const result = validatePlanWrite({ base: completeBase, weeks: { "1": broken }, strictGameweeks: [1] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /11 unique positive startingIds/);
  assert.match(result.errors.join(" "), /XI\/bench overlap/);
  assert.match(result.errors.join(" "), /current 15-player squad/);
  assert.match(result.errors.join(" "), /captain must be a starting player/);
});
