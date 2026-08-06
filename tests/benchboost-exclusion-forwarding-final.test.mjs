import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/benchboost-compare/route.js", import.meta.url), "utf8");
const installer = fs.readFileSync(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url), "utf8");

test("backend accepts the primitive Letta exclusion text alias", () => {
  assert.equal(route.includes("excluded_player_names_text"), true);
  assert.equal(route.includes("const textExclusions"), true);
  assert.equal(route.includes("excluded_player_names must be an array or excluded_player_names_text"), true);
});

test("strict Letta wrapper translates exclusions and fails closed", () => {
  assert.equal(installer.includes('"excluded_player_names": requested_exclusions'), true);
  assert.equal(installer.includes("At least one hard exclusion is required"), true);
  assert.equal(installer.includes("The backend report dropped all requested hard exclusions"), true);
  assert.equal(installer.includes("The backend report omitted requested exclusions"), true);
  assert.equal(installer.includes("Muniz (FUL)"), true);
  assert.equal(installer.includes("Solanke (TOT)"), true);
  assert.equal(installer.includes("Mykolenko (EVE)"), true);
});
