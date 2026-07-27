import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the retired harness stays empty", () => {
  const s = readFileSync("lib/harness.mjs", "utf8");
  assert.ok(s.length < 400 && /RETIRED/.test(s), "if this grows again, it has been resurrected by accident");
});
