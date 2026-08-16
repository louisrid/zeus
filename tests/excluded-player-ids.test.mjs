import test from "node:test";
import assert from "node:assert/strict";
import { parseExcludedPlayerIds } from "../lib/excluded-player-ids.mjs";

test("canonical excluded_player_ids is accepted", () => {
  assert.deepEqual(
    parseExcludedPlayerIds({ excluded_player_ids: [445, 4, 4, 94] }),
    { ok: true, value: [4, 94, 445], source: "excluded_player_ids" },
  );
});

test("legacy aliases remain accepted", () => {
  assert.deepEqual(
    parseExcludedPlayerIds({ exclude_player_ids: [4, 94] }),
    { ok: true, value: [4, 94], source: "exclude_player_ids" },
  );
  assert.deepEqual(
    parseExcludedPlayerIds({ ignores: [4, 94] }),
    { ok: true, value: [4, 94], source: "ignores" },
  );
});

test("matching aliases pass and conflicting aliases fail", () => {
  assert.equal(
    parseExcludedPlayerIds({ excluded_player_ids: [4, 94], exclude_player_ids: [94, 4] }).ok,
    true,
  );
  const conflict = parseExcludedPlayerIds({
    excluded_player_ids: [4],
    exclude_player_ids: [94],
  });
  assert.equal(conflict.ok, false);
  assert.match(conflict.error, /Conflicting exclusion fields/);
});

test("invalid exclusion values are rejected, and delimited text is not one of them", () => {
  /* A delimited string is a supported input, not an error: the agent path sends ids as text and the
     parser splits them. What must still be refused is anything that cannot be a player id at all, since
     coercing those silently is how an exclusion request loses a player without saying so. */
  assert.deepEqual(parseExcludedPlayerIds({ excluded_player_ids: "4" }).value, [4], "a single id as text");
  assert.deepEqual(parseExcludedPlayerIds({ excluded_player_ids: "4,5" }).value, [4, 5], "delimited text");
  assert.deepEqual(parseExcludedPlayerIds({ excluded_player_ids: "[4,5]" }).value, [4, 5], "a bracketed list");
  assert.deepEqual(parseExcludedPlayerIds({ excluded_player_ids: 4 }).value, [4], "a bare number");

  // Nullish placeholders resolve to no exclusions rather than to a player called "none".
  for (const placeholder of ["none", "null", "undefined", "", " ", "n/a", "-"]) {
    const result = parseExcludedPlayerIds({ excluded_player_ids: placeholder });
    assert.equal(result.ok, true, `${placeholder} must not raise`);
    assert.deepEqual(result.value, [], `${placeholder} means no exclusions`);
  }

  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: "abc" }).ok, false, "not an id");
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: [0, 4] }).ok, false, "zero is not an id");
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: [4.5] }).ok, false, "ids are integers");
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: [-3] }).ok, false, "ids are positive");
});
