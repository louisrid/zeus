import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function loadSavedSquadsResponse() {
  const source = readFileSync("app/api/brief/route.js", "utf8");
  const start = source.indexOf("async function savedSquadsResponse(request, params) {");
  const end = source.indexOf("\n\nasync function textBrief", start);
  assert.ok(start >= 0 && end > start, "savedSquadsResponse must remain extractable");
  const functionSource = source.slice(start, end);
  let captured = null;
  const loadForServer = async () => ({
    gw: 1,
    plans: [],
    players: [],
    scorer: { lineupGate: { report: { active: true } } },
  });
  const buildSavedSquadsPayload = (options) => {
    captured = options;
    return { saved_squad_count: 0, available_squads: [], selected_squad: null };
  };
  const ResponseStub = {
    json(body, init = {}) { return { body, status: init.status ?? 200 }; },
  };
  const factory = new Function(
    "loadForServer",
    "buildSavedSquadsPayload",
    "Response",
    "EXTERNAL_XPTS_GW_TO",
    "EXTERNAL_XPTS_SOURCE",
    "briefAuthOkay",
    "validGw",
    `${functionSource}\nreturn savedSquadsResponse;`,
  );
  const fn = factory(
    loadForServer,
    buildSavedSquadsPayload,
    ResponseStub,
    8,
    "external-xpts",
    () => true,
    (value, fallback) => Number.isInteger(Number(value)) ? Number(value) : fallback,
  );
  return { fn, captured: () => captured };
}

const request = { headers: { get: () => "" }, url: "https://zeus.test/api/brief" };

test("simulate_gw alone selects that exact gameweek and stays read-only", async () => {
  const loaded = loadSavedSquadsResponse();
  const response = await loaded.fn(request, {
    view: "squads",
    plan: "active",
    simulate_chip: "benchboost",
    simulate_gw: "2",
    include_players: "false",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.gw, 2);
  assert.equal(response.body.gw_from, 2);
  assert.equal(response.body.gw_to, 2);
  assert.equal(response.body.simulate_gw, 2);
  assert.equal(loaded.captured().simulateChip, "benchboost");
  assert.equal(loaded.captured().simulateGw, 2);
  assert.equal(loaded.captured().includePlayers, false);
});

test("omitting simulate_gw preserves the existing gw default", async () => {
  const loaded = loadSavedSquadsResponse();
  const response = await loaded.fn(request, {
    view: "squads",
    gw: "1",
    simulate_chip: "wildcard",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.gw, 1);
  assert.equal(response.body.gw_from, 1);
  assert.equal(response.body.gw_to, 1);
  assert.equal(response.body.simulate_gw, 1);
});

test("explicit ranges accept a simulation only inside the range", async () => {
  const valid = loadSavedSquadsResponse();
  const response = await valid.fn(request, {
    view: "squads",
    gw_from: "1",
    gw_to: "4",
    simulate_chip: "triplecaptain",
    simulate_gw: "3",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.gw_from, 1);
  assert.equal(response.body.gw_to, 4);
  assert.equal(response.body.gw, 3);

  const invalid = loadSavedSquadsResponse();
  const rejected = await invalid.fn(request, {
    view: "squads",
    gw_from: "1",
    gw_to: "2",
    simulate_chip: "benchboost",
    simulate_gw: "3",
  });
  assert.equal(rejected.status, 400);
});

test("simulate_gw without a chip and unsupported gameweeks fail clearly", async () => {
  const noChip = loadSavedSquadsResponse();
  const missing = await noChip.fn(request, { view: "squads", simulate_gw: "2" });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /requires simulate_chip/);

  const unsupported = loadSavedSquadsResponse();
  const rejected = await unsupported.fn(request, {
    view: "squads",
    simulate_chip: "benchboost",
    simulate_gw: "9",
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /GW1-GW8/);
});
