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

test("invalid exclusion values are rejected", () => {
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: "4" }).ok, false);
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: [0, 4] }).ok, false);
  assert.equal(parseExcludedPlayerIds({ excluded_player_ids: [4.5] }).ok, false);
});
