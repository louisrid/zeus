import test from "node:test";
import assert from "node:assert/strict";
import { parseOptimiseRequest, OPTIMISE_GW_MAX } from "../lib/optimise-request.mjs";

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
  /* The upper bound is the served external-xPTS horizon, read from config. Asserting a literal
   * here is what let the old hardcoded cap of 8 survive after gw_served_to moved past it. */
  assert.equal(parseOptimiseRequest(params(`mode=squad&gw_from=${OPTIMISE_GW_MAX}&gw_to=${OPTIMISE_GW_MAX + 1}`), { currentGw: 1 }).ok, false);
  assert.equal(parseOptimiseRequest(params(`mode=squad&gw_from=1&gw_to=${OPTIMISE_GW_MAX}`), { currentGw: 1 }).ok, true);
  assert.equal(parseOptimiseRequest(params("mode=squad&gw_from=4&gw_to=2"), { currentGw: 1 }).ok, false);
});

test("chip schedules are gameweek-specific and reject collisions", () => {
  const parsed = parseOptimiseRequest(params(`mode=squad&gw_from=1&gw_to=3&chip_schedule=${encodeURIComponent(JSON.stringify({ 1: "benchboost", 2: "triplecaptain" }))}`));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.chipSchedule, { 1: "benchboost", 2: "triplecaptain" });

  const collision = parseOptimiseRequest(params(`mode=squad&gw_from=1&gw_to=3&chip_schedule=${encodeURIComponent(JSON.stringify({ 2: "benchboost" }))}&chip=triplecaptain&chip_gw=2`));
  assert.equal(collision.ok, false);
});

test("benchboost mode refuses to guess which gameweek the chip is played in", () => {
  /* This used to default to the first week of the range. A request for Bench Boost in GW2 therefore came
     back with it played in GW1, silently, and the answer looked legitimate. A chip is worth several
     points in the right week and nothing in the wrong one, so an unstated week is now an error. */
  const guessed = parseOptimiseRequest(params("mode=benchboost&gw_from=3&gw_to=5"));
  assert.equal(guessed.ok, false);
  assert.match(guessed.error, /needs the gameweek it is played in/);

  /* Stated explicitly, it lands where it was asked for and nowhere else. */
  const stated = parseOptimiseRequest(params("mode=benchboost&gw_from=3&gw_to=5&chip=benchboost&chip_gw=4"));
  assert.equal(stated.ok, true);
  assert.equal(stated.chipSchedule[4], "benchboost");
  assert.equal(stated.chipSchedule[3], undefined);

  /* A single-gameweek request has only one answer, so there is nothing to guess. */
  const single = parseOptimiseRequest(params("mode=benchboost&gw_from=3&gw_to=3"));
  assert.equal(single.ok, true);
  assert.equal(single.chipSchedule[3], "benchboost");
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
