import test from "node:test";
import assert from "node:assert/strict";
import { parseOptimiseRequest } from "../lib/optimise-request.mjs";

const params = (query) => new URL(`https://zeus.test/api/optimise?${query}`).searchParams;

test("exact optimiser ranges preserve a later starting gameweek", () => {
  const parsed = parseOptimiseRequest(params("mode=squad&gw_from=2&gw_to=4&format=json"), { currentGw: 1 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.gwFrom, 2);
  assert.equal(parsed.gwTo, 4);
  assert.equal(parsed.format, "json");
});

test("legacy weeks remains current-gameweek based without pretending to support another start", () => {
  const parsed = parseOptimiseRequest(params("mode=squad&weeks=3"), { currentGw: 2 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.gwFrom, 2);
  assert.equal(parsed.gwTo, 4);
  assert.equal(parsed.explicitRange, false);
});

test("unsupported or incomplete ranges fail clearly", () => {
  assert.equal(parseOptimiseRequest(params("mode=squad&gw_from=2"), { currentGw: 1 }).ok, false);
  assert.equal(parseOptimiseRequest(params("mode=squad&gw_from=0&gw_to=2"), { currentGw: 1 }).ok, false);
  assert.equal(parseOptimiseRequest(params("mode=squad&gw_from=7&gw_to=9"), { currentGw: 1 }).ok, false);
  assert.equal(parseOptimiseRequest(params("mode=squad&gw_from=4&gw_to=2"), { currentGw: 1 }).ok, false);
});

test("chip schedules are gameweek-specific and reject collisions", () => {
  const parsed = parseOptimiseRequest(params(`mode=squad&gw_from=1&gw_to=3&chip_schedule=${encodeURIComponent(JSON.stringify({ 1: "benchboost", 2: "triplecaptain" }))}`));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.chipSchedule, { 1: "benchboost", 2: "triplecaptain" });

  const collision = parseOptimiseRequest(params(`mode=squad&gw_from=1&gw_to=3&chip_schedule=${encodeURIComponent(JSON.stringify({ 2: "benchboost" }))}&chip=triplecaptain&chip_gw=2`));
  assert.equal(collision.ok, false);
});

test("benchboost mode assigns the chip to the first requested gameweek when omitted", () => {
  const parsed = parseOptimiseRequest(params("mode=benchboost&gw_from=3&gw_to=5"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.chipSchedule[3], "benchboost");
});


test("chip schedules and transfer hits must stay inside the exact requested range", () => {
  const outsideChip = parseOptimiseRequest(params(`mode=squad&gw_from=2&gw_to=4&chip_schedule=${encodeURIComponent(JSON.stringify({ 1: "benchboost" }))}`));
  assert.equal(outsideChip.ok, false);
  assert.match(outsideChip.error, /outside GW2-GW4/);

  const outsideLegacyChip = parseOptimiseRequest(params("mode=squad&gw_from=2&gw_to=4&chip=triplecaptain&chip_gw=5"));
  assert.equal(outsideLegacyChip.ok, false);
  assert.match(outsideLegacyChip.error, /inside the requested/);

  const outsideHit = parseOptimiseRequest(params(`mode=squad&gw_from=2&gw_to=4&transfer_hits=${encodeURIComponent(JSON.stringify({ 5: 4 }))}`));
  assert.equal(outsideHit.ok, false);
  assert.match(outsideHit.error, /outside GW2-GW4/);
});
