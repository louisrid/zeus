import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyLineupRolePrior,
  buildRoleModel,
  deriveAttackingRateBounds,
} from "../lib/engine/player_roles.mjs";
import { allocateTeam } from "../lib/engine/layer2_allocation.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

function historicalProfile(position, npxg90, xa90, nineties = 20, extra = {}) {
  return {
    position,
    npxg90,
    xa90,
    cbit90: position === "MID" ? 3 : position === "DEF" ? 6 : 1,
    recoveries90: position === "MID" ? 5 : 3,
    nineties,
    rateNineties: nineties,
    ...extra,
  };
}

test("a valid formation supplies only missing low-sample attacking roles", () => {
  const unknown = applyLineupRolePrior(
    { player_id: 1, position: "MID", nineties: 0, role: null, role_source: "position-only" },
    "holding_midfielder",
    10,
  );
  assert.equal(unknown.role, "holding_midfielder");
  assert.equal(unknown.role_source, "predicted-formation-fallback");

  const established = applyLineupRolePrior(
    { player_id: 2, position: "MID", nineties: 25, role: "creator_midfielder", role_source: "derived-prior-season" },
    "holding_midfielder",
    10,
  );
  assert.equal(established.role, "creator_midfielder", "real history must beat one predicted formation");
  assert.equal(established.role_source, "derived-prior-season");

  const incompatible = applyLineupRolePrior(
    { player_id: 3, position: "DEF", nineties: 0, role: null },
    "focal_striker",
    10,
  );
  assert.equal(incompatible.role, null, "a formation label cannot cross FPL positions");
});

test("low-sample attacking upper bounds are derived from established populations", () => {
  const profiles = [];
  for (const value of [0.05, 0.08, 0.11, 0.14, 0.18, 0.24]) {
    profiles.push(historicalProfile("MID", value, value + 0.04));
  }
  for (const value of [0.25, 0.32, 0.4, 0.48, 0.6, 0.72]) {
    profiles.push(historicalProfile("FWD", value, value / 3));
  }
  const bounds = deriveAttackingRateBounds(profiles, undefined, { minimumNineties: 10, upperQuantile: 0.9 });
  assert.ok(bounds.npxg90.position.MID > 0.18 && bounds.npxg90.position.MID < 0.24);
  assert.ok(bounds.npxg90.position.FWD > bounds.npxg90.position.MID);
  assert.ok(bounds.xa90.position.MID > bounds.npxg90.position.MID);

  const model = buildRoleModel(profiles, { minimumPlayerNineties: 10 });
  assert.deepEqual(model.attackingRateBounds, bounds);
});

function allocationConfig(withBounds = true) {
  return {
    rateShrinkNineties: 20,
    kPos: 20,
    minimumRoleNineties: 10,
    roleRates: {
      npxg90: {
        goalkeeper: 0.001,
        balanced_defender: 0.045,
        holding_midfielder: 0.055,
        attacking_midfielder: 0.35,
        focal_striker: 0.62,
      },
      xa90: {
        goalkeeper: 0.002,
        balanced_defender: 0.05,
        holding_midfielder: 0.08,
        attacking_midfielder: 0.32,
        focal_striker: 0.14,
      },
    },
    leagueRates: {
      npxg90: { GKP: 0.001, DEF: 0.06, MID: 0.16, FWD: 0.42 },
      xa90: { GKP: 0.002, DEF: 0.06, MID: 0.14, FWD: 0.1 },
    },
    attackingRateBounds: withBounds ? {
      npxg90: { role: {}, position: { MID: 0.34, FWD: 0.8, DEF: 0.16, GKP: 0.01 } },
      xa90: { role: {}, position: { MID: 0.38, FWD: 0.3, DEF: 0.2, GKP: 0.01 } },
    } : null,
    finishingK: 60,
    finishingClamp: 0.15,
    assistRoleWeight: null,
    assistWeight: null,
    promotedDecayToGw: 10,
  };
}

function strongTeam() {
  return {
    promoted: false,
    players: [
      {
        player_id: "star", position: "FWD", role: "focal_striker", role_source: "derived-prior-season",
        npxg90: 0.85, xa90: 0.22, npxgNineties: 35, xaNineties: 35,
        goals: 22, xg: 20, shots: 100, rate_source: "history",
      },
      {
        player_id: "spike", position: "MID", role: "attacking_midfielder", role_source: "predicted-formation-fallback",
        npxg90: 1.5, xa90: 1.0, npxgNineties: 2, xaNineties: 2,
        goals: 4, xg: 3, shots: 18, rate_source: "short-sample",
      },
      {
        player_id: "holder", position: "MID", role: "holding_midfielder", role_source: "predicted-formation-fallback",
        npxg90: 0.16, xa90: 0.14, npxgNineties: 0, xaNineties: 0,
        goals: 0, xg: 0, shots: 0, rate_source: "prior-positional",
      },
      {
        player_id: "defender", position: "DEF", role: "balanced_defender", role_source: "predicted-formation-fallback",
        npxg90: 0.06, xa90: 0.06, npxgNineties: 0, xaNineties: 0,
        goals: 0, xg: 0, shots: 0, rate_source: "prior-positional",
      },
      {
        player_id: "keeper", position: "GKP", role: "goalkeeper", role_source: "predicted-formation-fallback",
        npxg90: 0.001, xa90: 0.002, npxgNineties: 0, xaNineties: 0,
        goals: 0, xg: 0, shots: 0, rate_source: "prior-positional",
      },
    ],
  };
}

test("strong-team attack is distributed by evidence and role without flattening established premiums", () => {
  const bounded = allocateTeam({
    team: strongTeam(), lambda: 2.4, priors: {}, cfg: allocationConfig(true), gw: 1, promotedPrior: null,
  });
  const unbounded = allocateTeam({
    team: strongTeam(), lambda: 2.4, priors: {}, cfg: allocationConfig(false), gw: 1, promotedPrior: null,
  });
  const lowLambda = allocateTeam({
    team: strongTeam(), lambda: 1.2, priors: {}, cfg: allocationConfig(true), gw: 1, promotedPrior: null,
  });

  const byId = new Map(bounded.players.map((player) => [player.player_id, player]));
  const noBoundById = new Map(unbounded.players.map((player) => [player.player_id, player]));
  const lowById = new Map(lowLambda.players.map((player) => [player.player_id, player]));

  close(bounded.players.reduce((sum, player) => sum + player.goalShare, 0), 1);
  close(bounded.players.reduce((sum, player) => sum + player.assistShare, 0), 1);
  assert.ok(byId.get("star").goalShare > byId.get("spike").goalShare);
  assert.ok(byId.get("spike").goalShare > byId.get("holder").goalShare);
  assert.ok(byId.get("holder").goalShare > byId.get("defender").goalShare);

  assert.equal(byId.get("star").used_npxg90, noBoundById.get("star").used_npxg90,
    "the low-sample guard cannot flatten an established premium");
  assert.ok(byId.get("spike").used_npxg90 < noBoundById.get("spike").used_npxg90,
    "the isolated short-sample spike is bounded by the established population");
  assert.equal(byId.get("spike").attacking_rate_bound_applied, true);
  assert.match(byId.get("spike").rate_source, /low-sample-upper-bound/);
  assert.match(byId.get("holder").rate_source, /lineup-role:holding_midfielder/);

  for (const player of bounded.players) {
    close(player.goalShare, lowById.get(player.player_id).goalShare,
      1e-12);
    close(player.assistShare, lowById.get(player.player_id).assistShare,
      1e-12);
  }
});

test("runtime wires formation roles and population bounds into one allocation path", () => {
  const runtime = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(runtime, /cfg\.attackingRateBounds = roleModel\.attackingRateBounds/);
  assert.match(runtime, /applyLineupRolePrior\([\s\S]*applyDefensiveRolePrior\(/);

  const combined = [
    readFileSync(new URL("../lib/engine/player_roles.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../lib/engine/layer2_allocation.mjs", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(combined, /Watkins|Belloumi|Saka|Rice|Gabriel|Lavia|Gomes/,
    "distribution correction must not contain named-player exceptions");
});
