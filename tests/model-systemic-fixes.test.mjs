import test from "node:test";
import assert from "node:assert/strict";
import { fallbackGoalEnvironment, fallbackGoalEnvironmentForTeams } from "../lib/engine/layer0_market.mjs";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";
import { lineupFootballRolesOf } from "../lib/lineups.mjs";
import { defensiveRateOrPrior } from "../lib/engine/player_rate_resolver.mjs";
import { allocateTeam } from "../lib/engine/layer2_allocation.mjs";

test("overall-strength fallback no longer inflates total goals for a large mismatch", () => {
  const result = fallbackGoalEnvironment(2000, 500, 2.8, 1.13);
  assert.equal(Number((result.lambda_home + result.lambda_away).toFixed(4)), 2.8);
  assert.ok(result.lambda_home > result.lambda_away);
});

test("attack-versus-defence components take precedence over overall club strength", () => {
  const leagueTeams = [
    { strength_attack_home: 1000, strength_defence_home: 1000, strength_attack_away: 1000, strength_defence_away: 1000 },
    { strength_attack_home: 900, strength_defence_home: 1200, strength_attack_away: 900, strength_defence_away: 1200 },
    { strength_attack_home: 1100, strength_defence_home: 900, strength_attack_away: 1100, strength_defence_away: 900 },
  ];
  const result = fallbackGoalEnvironmentForTeams({
    homeTeam: { strength: 2000, strength_attack_home: 900, strength_defence_home: 900 },
    awayTeam: { strength: 500, strength_attack_away: 900, strength_defence_away: 1200 },
    leagueTeams,
    leagueMeanGoals: 2.8,
    homeAdvantage: 1.13,
  });
  assert.equal(result.deoverround_method, "team-component-strength-fallback");
  assert.ok(result.lambda_home < 1.4, `elite defence should suppress the home attack, got ${result.lambda_home}`);
  assert.ok(result.lambda_home + result.lambda_away <= 2.8 * 1.15 + 1e-9);
});

test("history matcher rejects surname-only cross-club false matches", () => {
  const source = [{ player_name: "Alex Gomes", team: "Old Club", xg: 8, xa: 6, minutes: 2000 }];
  const player = { name: "Joao Gomes", web_name: "Gomes", team_name: "Aston Villa", fpl_id: 999 };
  assert.equal(matchExpectedMetricsRow({ player, source }), null);
});

test("published formation identifies the first midfield line as holding midfield", () => {
  const gk = { fpl_id: 1, position: "GKP" };
  const def = { fpl_id: 2, position: "DEF" };
  const gomes = { fpl_id: 3, position: "MID" };
  const ten = { fpl_id: 4, position: "MID" };
  const fwd = { fpl_id: 5, position: "FWD" };
  const resolution = { byClub: new Map([["AVL", { lines: [
    [{ player: gk }], [{ player: def }], [{ player: gomes }], [{ player: ten }], [{ player: fwd }],
  ] }]]) };
  const roles = lineupFootballRolesOf(resolution);
  assert.equal(roles.get(gomes.fpl_id), "holding_midfielder");
  assert.equal(roles.get(ten.fpl_id), "attacking_midfielder");
});

test("a no-history starter receives the defensive positional prior instead of zero", () => {
  assert.equal(defensiveRateOrPrior({ rate: 0, nineties: 0, prior: 7.4 }), 7.4);
  assert.equal(defensiveRateOrPrior({ rate: 5.2, nineties: 12, prior: 7.4 }), 5.2);
});

test("archive side-rows produce 38 team games rather than being doubled to 76", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(source, /archiveFixtures\.length \/ Math\.max\(1, live\.length\)/);
  assert.ok(!source.includes("2 * archiveFixtures.length"));
});

test("a data-free promoted attacker is pulled toward a conservative cohort rate", () => {
  const players = [
    { player_id: 1, position: "MID", role: "attacking_midfielder", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0, goals: 0, xg: 0, shots: 0 },
    { player_id: 2, position: "MID", role: "holding_midfielder", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0, goals: 0, xg: 0, shots: 0 },
  ];
  const cfg = {
    roleRates: {
      npxg90: { holding_midfielder: 0.04, box_to_box_midfielder: 0.11, creator_midfielder: 0.13, attacking_creator: 0.23, attacking_midfielder: 0.32 },
      xa90: { holding_midfielder: 0.05, box_to_box_midfielder: 0.10, creator_midfielder: 0.22, attacking_creator: 0.28, attacking_midfielder: 0.20 },
    },
    leagueRates: { npxg90: { MID: 0.16 }, xa90: { MID: 0.15 } },
    rateShrinkNineties: 20, kPos: 20, promotedDecayToGw: 10,
    finishingK: 60, finishingClamp: 0.15,
  };
  const result = allocateTeam({ team: { players, promoted: true }, lambda: 1.2, priors: {}, cfg, gw: 1, promotedPrior: null });
  const attacker = result.players.find((player) => player.player_id === 1);
  assert.ok(attacker.used_npxg90 < 0.32, `promoted no-history attacker stayed at full attacking prior: ${attacker.used_npxg90}`);
  assert.ok(attacker.used_npxg90 >= 0.04);
});
