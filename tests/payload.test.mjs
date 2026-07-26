import test from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../lib/payload.mjs";

const p = (fpl_id, web_name, extra = {}) => ({ fpl_id, web_name, team: "ARS", position: "MID",
  price: 8.5, own: 32.4, starting: true, status: "a", chance_of_playing: null, ...extra });

test("the payload states the metric and whether it is validated", () => {
  const out = buildPayload({ squad: { players: [p(1, "Saka")], structure: "3-4-3" },
    metricName: "INTERIM SCORE", gateOpen: false, scoreOf: () => 5 });
  assert.match(out, /Metric shown in app: INTERIM SCORE/);
  assert.match(out, /interim score, not a validated projection/);
});

test("a passed gate drops the warning", () => {
  const out = buildPayload({ squad: { players: [] }, metricName: "xP", gateOpen: true });
  assert.match(out, /Calibration gate PASSED/);
  assert.ok(!/not a validated projection/.test(out));
});

test("missing values are said to be unknown rather than shown as zero", () => {
  const out = buildPayload({ squad: { players: [p(1, "Saka", { price: null, own: undefined })] },
    metricName: "INTERIM SCORE", gateOpen: false, scoreOf: () => null });
  assert.match(out, /unknownm/);
  assert.match(out, /score unknown/);
  assert.ok(!/0\.0m/.test(out), "an absent price must never render as 0.0");
});

test("an empty squad says so instead of producing a blank list", () => {
  const out = buildPayload({ squad: { players: [] }, metricName: "INTERIM SCORE", gateOpen: false });
  assert.match(out, /nothing picked yet/);
});

test("template alignment carries its interpretation", () => {
  const out = buildPayload({ squad: { players: [] }, metricName: "x", gateOpen: false,
    scores: { overall: 80, lines: {}, template: { pct: 55, shared: 8, of: 15, missing: [p(2, "Salah")], unique: [] }, clubs: { clubs: 9, max: 3 } } });
  assert.match(out, /NOT higher-is-better/);
  assert.match(out, /template players missing: Salah/);
});

test("it closes by forbidding estimation", () => {
  const out = buildPayload({ squad: { players: [] }, metricName: "x", gateOpen: false });
  assert.match(out, /say so rather than estimating/);
});
