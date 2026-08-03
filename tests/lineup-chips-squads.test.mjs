import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildExternalProjectionModel, EXTERNAL_XPTS_GAMEWEEKS } from "../lib/external_xpts.mjs";
import { projectSquad, projectSquadRange } from "../lib/squad-projection.mjs";
import { buildSavedSquadsPayload } from "../lib/server/squad-brief.mjs";

test("predicted line-ups are the single effective xPTS and start-probability gate", () => {
  const players = [
    { id: 1, fpl_id: 1, web_name: "Haaland", name: "Erling Haaland", position: "FWD", team_id: 1, team: "MCI", price: 14, own: 50 },
    { id: 2, fpl_id: 2, web_name: "Saka", name: "Bukayo Saka", position: "MID", team_id: 2, team: "ARS", price: 10, own: 40 },
  ];
  const model = buildExternalProjectionModel(players, {
    currentGw: 1,
    lineupStartingIds: new Set([1]),
    lineupGateReport: { predicted_starters: 1 },
  });

  assert.equal(model.scoreForGw(players[0], 1), 7.5, "a predicted starter keeps the imported xPTS");
  assert.equal(model.rawScoreForGw(players[0], 1), 7.5);
  assert.equal(model.startProbForGw(players[0], 1), 1);
  assert.equal(model.predictedStartOf(players[0]), true);

  for (const gw of EXTERNAL_XPTS_GAMEWEEKS) {
    assert.equal(model.scoreForGw(players[1], gw), 0, `a non-starter is zero in GW${gw}`);
    assert.equal(model.startProbForGw(players[1], gw), 0, `a non-starter has probability zero in GW${gw}`);
  }
  assert.equal(model.rawScoreForGw(players[1], 1), 5.2, "the source value remains auditable");
  assert.equal(model.predictedStartOf(players[1]), false);
});

test("Wildcard, Bench Boost and Triple Captain use one score calculator", () => {
  const players = Array.from({ length: 15 }, (_, index) => ({
    fpl_id: index + 1,
    starting: index < 11,
    score: index + 1,
  }));
  const scoreOf = (player) => player.score;

  const baseline = projectSquad({ players, captain: 11, transferHit: 8, scoreOf });
  assert.equal(baseline.startingXpts, 66);
  assert.equal(baseline.captainBonus, 11);
  assert.equal(baseline.transferHit, 8);
  assert.equal(baseline.netXpts, 69);

  const triple = projectSquad({ players, captain: 11, chip: "triplecaptain", transferHit: 8, scoreOf });
  assert.equal(triple.captainMultiplier, 3);
  assert.equal(triple.captainBonus, 22);
  assert.equal(triple.netXpts, 80);

  const boost = projectSquad({ players, captain: 11, chip: "benchboost", transferHit: 8, scoreOf });
  assert.equal(boost.benchBoostBonus, 12 + 13 + 14 + 15);
  assert.equal(boost.netXpts, 123);

  const wildcard = projectSquad({ players, captain: 11, chip: "wildcard", transferHit: 8, scoreOf });
  assert.equal(wildcard.transferHit, 0);
  assert.equal(wildcard.wildcardSaving, 8);
  assert.equal(wildcard.netXpts, 77);

  const range = projectSquadRange({
    players,
    captain: 11,
    gwFrom: 1,
    gwTo: 2,
    scoreForGw: (player, gw) => player.score * gw,
    chipForGw: (gw) => gw === 1 ? "benchboost" : null,
  });
  assert.equal(range.weeks.length, 2);
  assert.equal(range.weeks[0].benchBoostBonus, 54);
  assert.equal(range.weeks[1].benchBoostBonus, 0);
});

test("saved squads are countable, selectable and simulatable for Letta", () => {
  const players = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    fpl_id: index + 1,
    web_name: `P${index + 1}`,
    name: `Player ${index + 1}`,
    position: index < 2 ? "GKP" : index < 7 ? "DEF" : index < 12 ? "MID" : "FWD",
    team_id: index + 1,
    team: `T${index + 1}`,
    price: 5,
    own: 1,
  }));
  const base = players.map((player, index) => ({
    fpl_id: player.fpl_id,
    position: player.position,
    team_id: player.team_id,
    price: player.price,
    purchasePrice: player.price,
    starting: index < 11,
  }));
  const plans = [
    { id: 4812, kind: "live", name: "Team 4812", base: [], weeks: {} },
    { id: 10, kind: "plan", name: "Main", is_active: true, base, captain: 11, weeks: { 1: { chip: "benchboost", transfers: [] } } },
    { id: 11, kind: "plan", name: "Second", is_active: false, base, captain: 10, weeks: {} },
  ];
  const scorer = {
    scoreForGw: (player) => Number(player.fpl_id),
    rawScoreForGw: (player) => Number(player.fpl_id) + 0.5,
    startProbForGw: (player) => Number(player.fpl_id) <= 11 ? 1 : 0,
    predictedStartOf: (player) => Number(player.fpl_id) <= 11,
  };

  const payload = buildSavedSquadsPayload({
    plans,
    players,
    scorer,
    gw: 1,
    selector: "active",
    simulateChip: "triplecaptain",
  });
  assert.equal(payload.saved_squad_count, 2, "the hidden hard-coded live slot is not counted");
  assert.equal(payload.selected_squad.plan_id, 10);
  assert.equal(payload.selected_squad.chip, "benchboost");
  assert.equal(payload.selected_squad.bench_boost_bonus, 54);
  assert.equal(payload.selected_squad.simulation.chip, "triplecaptain");
  assert.equal(payload.selected_squad.simulation.persisted, false);
  assert.equal(payload.selected_squad.players[0].raw_imported_xpts, 1.5);
});

test("Builder, Squad and the brief are wired to the shared chip and saved-squad contracts", () => {
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  const brief = readFileSync("app/api/brief/route.js", "utf8");
  const api = readFileSync("lib/server/fpl_brief_api.mjs", "utf8");
  const projections = readFileSync("lib/projections.js", "utf8");
  const pitch = readFileSync("components/BuilderPitch.jsx", "utf8");

  for (const src of [builder, squad]) {
    assert.match(src, /<ChipControls/);
    assert.match(src, /<ProjectedScoreBreakdown/);
    assert.match(src, /projectSquad/);
  }
  assert.match(builder, /weeks: planWeeks/);
  assert.match(squad, /patchWeek\(\{ chip:/);
  assert.match(squad, /SHOW_HARDCODED_SQUAD_4812 = false/);
  assert.match(brief, /view: "squads"/);
  assert.match(brief, /saved_squad_count/);
  assert.match(brief, /simulate_chip/);
  assert.match(api, /serverLineupGate/);
  assert.match(projections, /lineupStartingIds/);
  assert.match(pitch, /captainMultiplier = 2/);
  assert.match(pitch, /isCaptain \? captainMultiplier : 1/);
  assert.match(builder, /captainMultiplier=\{pitchCaptainMultiplier\}/);
  assert.match(squad, /captainMultiplier=\{projection\.captainMultiplier\}/);
});
