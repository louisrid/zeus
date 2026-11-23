import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePlanWeeks } from "../lib/plan-sanitize.mjs";
import { validatePlanWrite } from "../lib/plan-write-validation.mjs";

/* A legal 15: 2 GK, 5 DEF, 5 MID, 3 FWD, each a different club so no club cap trips. */
function squad() {
  const base = [];
  let id = 1, team = 1;
  const add = (pos, n) => { for (let i = 0; i < n; i += 1) base.push({ fpl_id: id++, position: pos, team_id: team++, price: 5 }); };
  add("GKP", 2); add("DEF", 5); add("MID", 5); add("FWD", 3);
  return base;
}
const idsOf = (base, filter) => base.filter(filter).map((p) => p.fpl_id);

test("a valid week is left untouched", () => {
  const base = squad();
  const starters = [base[0].fpl_id, ...idsOf(base, (p) => p.position === "DEF").slice(0, 4),
    ...idsOf(base, (p) => p.position === "MID").slice(0, 4), ...idsOf(base, (p) => p.position === "FWD").slice(0, 2)];
  const bench = base.map((p) => p.fpl_id).filter((x) => !starters.includes(x));
  const weeks = { 12: { startingIds: starters, benchOrder: bench, captain: starters[9], vice: starters[8], structure: "4-4-2" } };
  const out = sanitizePlanWeeks({ base, weeks, structure: "4-4-2", captain: starters[9], vice: starters[8] });
  assert.deepEqual(out, weeks);
  assert.ok(validatePlanWrite({ base, weeks: out, structure: "4-4-2", captain: starters[9], vice: starters[8] }).ok);
});

test("a week naming only 14 players is healed and the save then passes", () => {
  const base = squad();
  const starters = [base[0].fpl_id, ...idsOf(base, (p) => p.position === "DEF").slice(0, 4),
    ...idsOf(base, (p) => p.position === "MID").slice(0, 4), ...idsOf(base, (p) => p.position === "FWD").slice(0, 2)];
  const bench = base.map((p) => p.fpl_id).filter((x) => !starters.includes(x)).slice(0, 3); // only 3 → 14 named
  const weeks = { 11: { startingIds: starters, benchOrder: bench, captain: starters[9], vice: starters[8], structure: "4-4-2", chip: "wildcard" } };
  const out = sanitizePlanWeeks({ base, weeks, structure: "4-4-2", captain: starters[9], vice: starters[8] });
  assert.ok(validatePlanWrite({ base, weeks: out, structure: "4-4-2", captain: starters[9], vice: starters[8] }).ok, "save passes");
  assert.ok(!Array.isArray(out["11"].startingIds), "line-up stripped");
  assert.equal(out["11"].chip, "wildcard", "chip kept");
});

test("an illegal shape (six defenders) is healed", () => {
  const base = squad();
  const starters = [base[0].fpl_id, ...idsOf(base, (p) => p.position === "DEF").slice(0, 5),
    ...idsOf(base, (p) => p.position === "MID").slice(0, 3), ...idsOf(base, (p) => p.position === "FWD").slice(0, 2)];
  const bench = base.map((p) => p.fpl_id).filter((x) => !starters.includes(x));
  const weeks = { 12: { startingIds: starters, benchOrder: bench, captain: starters[9], vice: starters[8], structure: "6-3-2" } };
  const out = sanitizePlanWeeks({ base, weeks, structure: "6-3-2", captain: starters[9], vice: starters[8] });
  assert.ok(validatePlanWrite({ base, weeks: out, structure: "6-3-2", captain: starters[9], vice: starters[8] }).ok);
});
