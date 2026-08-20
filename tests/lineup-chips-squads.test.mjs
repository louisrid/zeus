import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildExternalProjectionModel, EXTERNAL_XPTS_GAMEWEEKS } from "../lib/external_xpts.mjs";
import { LINEUP_GATE_APPLIES_TO } from "../lib/lineup-xpts.mjs";
import DATA from "../config/external-xpts-2026-27.mjs";
import { projectSquad, projectSquadRange } from "../lib/squad-projection.mjs";
import { buildSavedSquadsPayload } from "../lib/server/squad-brief.mjs";

test("predicted line-ups are the single effective xPTS and start-probability gate", () => {
  /* Real FPL ids, because the import is keyed by id. Invented ids used to be harmless while rows were
     found by name; now id 1 is a real footballer and using it here would silently test the wrong row. */
  const HAALAND = 411;
  const SAKA = 12;
  const players = [
    { id: HAALAND, fpl_id: HAALAND, web_name: "Haaland", name: "Erling Haaland", position: "FWD", team_id: 15, team: "MCI", price: 15.5, own: 72.7 },
    { id: SAKA, fpl_id: SAKA, web_name: "Saka", name: "Bukayo Saka", position: "MID", team_id: 1, team: "ARS", price: 10, own: 40 },
  ];
  const model = buildExternalProjectionModel(players, {
    currentGw: 1,
    lineupStartingIds: new Set([HAALAND]),
    lineupGateReport: { predicted_starters: 1 },
  });
  const rowOf = (id) => DATA.rows.find((r) => r.fpl_id === id);

  assert.equal(model.scoreForGw(players[0], 1), rowOf(HAALAND).xpts[0], "a predicted starter keeps the imported xPTS");
  assert.equal(model.rawScoreForGw(players[0], 1), rowOf(HAALAND).xpts[0]);
  assert.equal(model.startProbForGw(players[0], 1), 1);
  assert.equal(model.predictedStartOf(players[0]), true);

  // The gate speaks for the weeks its snapshot covers, and only those.
  for (let gw = 1; gw <= LINEUP_GATE_APPLIES_TO; gw += 1) {
    assert.equal(model.scoreForGw(players[1], gw), 0, `a non-starter is zero in GW${gw}`);
    assert.equal(model.startProbForGw(players[1], gw), 0, `a non-starter has probability zero in GW${gw}`);
    assert.equal(model.rawScoreForGw(players[1], gw), rowOf(SAKA).xpts[gw - 1], "the source value remains auditable");
  }
  // Points are served only as far as the gate reaches, so there is no served week left ungated.
  assert.equal(EXTERNAL_XPTS_GAMEWEEKS.filter((w) => w > LINEUP_GATE_APPLIES_TO).length, 0,
    "no served gameweek may fall outside the gate");
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
  /* The plan's weeks still come from planWeeks, but they are normalised to canonical "1".."38" keys on
     the way out. A single stray key made the whole draft unsaveable with no way to clear it from the
     interface, so the sanitiser is part of the contract, not an optional extra. */
  assert.match(builder, /weeks: canonicalWeeks\(planWeeks\)/);
  assert.match(builder, /setPlanWeeks\(canonicalWeeks\(row\.weeks\)\)/, "and repaired on the way in");
  /* The chip's gameweek is chosen directly rather than inherited from whichever week the pitch happens to
     be showing, so the chip write targets chipGw and clears the same chip from any other week. */
  assert.match(squad, /aria-label="Chip gameweek"/, "the squad page picks the chip's gameweek");
  assert.match(squad, /weeks\[String\(target\)\] = \{ \.\.\.\(weeks\[String\(target\)\]/, "and writes the chip to it");
  assert.match(squad, /row\?\.chip === chip\) weeks\[key\] = \{ \.\.\.row, chip: null \}/, "a chip is played once");
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
