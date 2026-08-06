import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const installer = fs.readFileSync(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url), "utf8");

test("Letta schemas use Pydantic-compatible optional number fields", () => {
  assert.doesNotMatch(installer, /\"type\": \[\"number\", \"null\"\]/);
  assert.match(installer, /\"maximum_money_in_bank\": \{\"type\": \"number\", \"minimum\": 0\}/);
  assert.match(installer, /\"exact_money_in_bank\": \{\"type\": \"number\", \"minimum\": 0\}/);
  assert.match(installer, /\"goalkeeper_max_price\": \{\"type\": \"number\", \"exclusiveMinimum\": 0\}/);
});
