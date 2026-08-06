import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const installer = fs.readFileSync(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/benchboost-compare/route.js", import.meta.url), "utf8");
const optimiser = fs.readFileSync(new URL("../lib/server/exact-range-optimiser.mjs", import.meta.url), "utf8");

test("strict Letta tools use primitive-only argument schemas", () => {
  assert.equal(installer.includes('"type": "array"'), false);
  assert.equal(installer.includes('"type": ['), false);
  assert.equal(installer.includes('"enum":'), false);
  assert.equal(installer.includes("candidate_chip_gameweeks: list"), false);
  assert.equal(installer.includes("bench_boost_gw_a: int = 1"), true);
  assert.equal(installer.includes("bench_boost_gw_b: int = 2"), true);
  assert.equal(installer.includes('excluded_player_names_text: str = ""'), true);
});

test("strict Letta tools enforce goalkeeper and read-only controls", () => {
  assert.equal(installer.includes("goalkeeper_max_price: float = 4.5"), true);
  assert.equal(installer.includes('"goalkeeper_max_price": gk_cap'), true);
  assert.equal(installer.includes('"minimum_goalkeepers_at_or_below_price": minimum_cheap_gks'), true);
  assert.equal(installer.includes('"bench_order_policy": BENCH_ORDER_POLICY'), true);
  assert.equal(installer.includes('"suggest_always_benched_replacements": False'), true);
  assert.equal(installer.includes('"save_names": []'), true);
  assert.equal(installer.includes('"delete_plan_ids": []'), true);
  assert.equal(installer.includes('if "Goalkeeper price control: OFF" in report:'), true);
});

test("backend and optimiser enforce exact FPL squad composition and GK cap", () => {
  assert.equal(route.includes("const quotas = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };"), true);
  assert.equal(route.includes("cheapGoalkeepers.length < controls.minimumGoalkeepersAtOrBelowPrice"), true);
  assert.equal(optimiser.includes("const COMPOSITION = Object.freeze({ GKP: 2, DEF: 5, MID: 5, FWD: 3 });"), true);
  assert.equal(optimiser.includes("goalkeepers_at_or_below_price"), true);
});
