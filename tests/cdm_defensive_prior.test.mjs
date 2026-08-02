import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDefensiveRolePrior,
  buildRoleModel,
  lineupTacticalRolesOf,
} from "../lib/engine/player_roles.mjs";
import { allocateTeam } from "../lib/engine/layer2_allocation.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { readFileSync } from "node:fs";

const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url)));

const player = (fpl_id, position) => ({ fpl_id, position });
const entry = (fpl_id, position) => ({ player: player(fpl_id, position) });

function lineupResolution() {
  return {
    byClub: new Map([["TST", {
      valid: true,
      lines: [
        [entry(1, "GKP")],
        [entry(2, "DEF"), entry(3, "DEF"), entry(4, "DEF"), entry(5, "DEF")],
        [entry(6, "MID"), entry(7, "MID")],
        [entry(8, "MID"), entry(9, "MID"), entry(10, "MID")],
        [entry(11, "FWD")],
      ],
    }]]),
  };
}

function historyMid(name, roleShape, nineties = 20) {
  const shapes = {
    holding: { npxg90: 0.04, xa90: 0.06, cbit90: 6.2, recoveries90: 8.1 },
    box: { npxg90: 0.16, xa90: 0.15, cbit90: 3.3, recoveries90: 5.1 },
    creator: { npxg90: 0.31, xa90: 0.38, cbit90: 1.2, recoveries90: 3.0 },
    attacker: { npxg90: 0.39, xa90: 0.17, cbit90: 1.1, recoveries90: 2.8 },
  };
  return { player_name: name, position: "MID", nineties, ...shapes[roleShape] };
}

function roleHistory() {
  return [
    historyMid("Holder A", "holding"), historyMid("Holder B", "holding"), historyMid("Holder C", "holding"),
    historyMid("Box A", "box"), historyMid("Box B", "box"), historyMid("Box C", "box"),
    historyMid("Creator A", "creator"), historyMid("Creator B", "creator"), historyMid("Creator C", "creator"),
    historyMid("Attacker A", "attacker"), historyMid("Attacker B", "attacker"), historyMid("Attacker C", "attacker"),
  ];
}

test("predicted formation gives the double pivot a holding role without guessing from a name", () => {
  const roles = lineupTacticalRolesOf(lineupResolution());
  assert.equal(roles.get(6), "holding_midfielder");
  assert.equal(roles.get(7), "holding_midfielder");
  assert.equal(roles.get(8), "attacking_midfielder");
  assert.equal(roles.get(11), "focal_striker");
});

test("invalid or incomplete lineups do not create tactical role evidence", () => {
  const resolution = lineupResolution();
  resolution.byClub.get("TST").valid = false;
  assert.equal(lineupTacticalRolesOf(resolution).size, 0);
});

test("a no-history holding midfielder receives data-derived defensive rates only", () => {
  const model = buildRoleModel(roleHistory());
  const before = {
    player_id: 20,
    fpl_id: 20,
    position: "MID",
    nineties: 0,
    npxg90: 0.12,
    xa90: 0.11,
    cbit90: 0,
    recoveries90: 0,
    starts: 0,
    appearances: 0,
    startMinutes: 0,
  };
  const after = applyDefensiveRolePrior(before, model, "holding_midfielder");
  assert.ok(after.cbit90 > 0, after.cbit90);
  assert.ok(after.recoveries90 > 0, after.recoveries90);
  assert.equal(after.npxg90, before.npxg90);
  assert.equal(after.xa90, before.xa90);
  assert.equal(after.starts, before.starts);
  assert.equal(after.appearances, before.appearances);
  assert.equal(after.startMinutes, before.startMinutes);
  assert.equal(after.defensive_role, "holding_midfielder");
  assert.match(after.defensive_rate_source, /role:holding_midfielder|position:MID/);
});

test("an advanced no-history midfielder is not handed a holding-midfielder defensive profile", () => {
  const model = buildRoleModel(roleHistory());
  const before = { player_id: 21, fpl_id: 21, position: "MID", nineties: 0, npxg90: 0.2, xa90: 0.2, cbit90: 0, recoveries90: 0 };
  const after = applyDefensiveRolePrior(before, model, "attacking_midfielder");
  assert.equal(after.cbit90, 0);
  assert.equal(after.recoveries90, 0);
  assert.equal(after.npxg90, before.npxg90);
  assert.equal(after.xa90, before.xa90);
});

test("established defensive evidence is never overwritten by a predicted formation", () => {
  const model = buildRoleModel(roleHistory());
  const before = {
    player_id: 22,
    fpl_id: 22,
    position: "MID",
    role: "holding_midfielder",
    nineties: 30,
    npxg90: 0.05,
    xa90: 0.07,
    cbit90: 7.4,
    recoveries90: 9.2,
  };
  const after = applyDefensiveRolePrior(before, model, "attacking_midfielder");
  assert.equal(after.defensive_role, "holding_midfielder");
  assert.equal(after.cbit90, before.cbit90);
  assert.equal(after.recoveries90, before.recoveries90);
});

test("defensive priors cannot change team goal or assist allocation", () => {
  const model = buildRoleModel(roleHistory());
  const cfg = engineConfig(engineJson);
  cfg.roleRates = model.rates;
  cfg.assistWeight = { MID: 1 };
  cfg.assistRoleWeight = {};
  const basePlayers = [
    { player_id: 30, fpl_id: 30, position: "MID", nineties: 0, npxg90: 0.12, xa90: 0.10, npxgNineties: 0, xaNineties: 0, cbit90: 0, recoveries90: 0, goals: 0, xg: 0, shots: 0 },
    { player_id: 31, fpl_id: 31, position: "MID", nineties: 25, npxg90: 0.30, xa90: 0.25, npxgNineties: 25, xaNineties: 25, cbit90: 2, recoveries90: 4, goals: 5, xg: 6, shots: 45 },
  ];
  const adjustedPlayers = [
    applyDefensiveRolePrior(basePlayers[0], model, "holding_midfielder"),
    basePlayers[1],
  ];
  const before = allocateTeam({ team: { promoted: false, players: basePlayers }, lambda: 1.5, priors: {}, cfg, gw: 1, promotedPrior: null });
  const after = allocateTeam({ team: { promoted: false, players: adjustedPlayers }, lambda: 1.5, priors: {}, cfg, gw: 1, promotedPrior: null });
  for (const id of [30, 31]) {
    const a = before.players.find((p) => p.player_id === id);
    const b = after.players.find((p) => p.player_id === id);
    assert.equal(b.goalShare, a.goalShare);
    assert.equal(b.assistShare, a.assistShare);
    assert.equal(b.used_npxg90, a.used_npxg90);
    assert.equal(b.used_xa90, a.used_xa90);
  }
});

test("runtime wires tactical lineup roles into defensive priors without named-player overrides", () => {
  const source = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(source, /lineupTacticalRolesOf/);
  assert.match(source, /applyDefensiveRolePrior/);
  assert.doesNotMatch(source, /Lavia|Gomes|Belloumi|Watkins/);
});
