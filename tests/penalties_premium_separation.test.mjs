import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allocateTeam,
  deriveRoleAssistWeights,
  fixturePenaltyAwardRate,
  penaltyDutyShares,
  shrunkPenaltyAwardRate,
} from "../lib/engine/layer2_allocation.mjs";
import { simulateFixture, summarise } from "../lib/engine/layer4_sim.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { scoringTable, squadRules } from "../lib/engine/points.mjs";

const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url), "utf8"));
const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url), "utf8"));

function basePlayer(id, position, overrides = {}) {
  return {
    player_id: id,
    position,
    role: position === "FWD" ? "focal_striker" : position === "MID" ? "box_to_box_midfielder" : position === "DEF" ? "balanced_defender" : "goalkeeper",
    npxg90: position === "FWD" ? 0.55 : position === "MID" ? 0.12 : position === "DEF" ? 0.04 : 0,
    xa90: position === "FWD" ? 0.08 : position === "MID" ? 0.14 : position === "DEF" ? 0.05 : 0,
    npxgNineties: 30,
    xaNineties: 30,
    rateNineties: 30,
    nineties: 30,
    goals: 5,
    xg: 5,
    shots: 50,
    cbit90: position === "DEF" ? 6 : 2,
    recoveries90: 3,
    keyPasses90: 1,
    yellow90: 0,
    red90: 0,
    og90: 0,
    p_start: 1,
    p_cameo: 0,
    p60: 1,
    p60_given_start: 1,
    exp_min_start: 94,
    exp_min_cameo: 0,
    minutes_source: "lineup-starter",
    penRank: 0,
    penConfidence: null,
    pensTaken: 0,
    penConversion: 0.79,
    ...overrides,
  };
}

function eleven(prefix, strikerOverrides = {}) {
  return [
    basePlayer(`${prefix}-gk`, "GKP"),
    ...Array.from({ length: 4 }, (_, i) => basePlayer(`${prefix}-d${i}`, "DEF")),
    ...Array.from({ length: 5 }, (_, i) => basePlayer(`${prefix}-m${i}`, "MID")),
    basePlayer(`${prefix}-star`, "FWD", strikerOverrides),
  ];
}

test("team penalty rate is shrunk toward the league instead of zero", () => {
  const zeroTeam = shrunkPenaltyAwardRate({
    teamAttempts: 0,
    teamMatches: 38,
    leagueAttempts: 90,
    leagueTeamMatches: 760,
    priorMatches: 38,
  });
  const highTeam = shrunkPenaltyAwardRate({
    teamAttempts: 10,
    teamMatches: 38,
    leagueAttempts: 90,
    leagueTeamMatches: 760,
    priorMatches: 38,
  });
  assert.ok(zeroTeam > 0, zeroTeam);
  assert.ok(highTeam > zeroTeam, `${highTeam} <= ${zeroTeam}`);
  assert.ok(highTeam < 10 / 38, "shrinkage should pull an extreme team back toward the league");
});

test("strong attacking fixtures carry more penalty expectation without an unbounded jump", () => {
  const baseRate = 0.12;
  const weak = fixturePenaltyAwardRate({ baseRate, lambda: 0.8, leagueGoalsPerTeam: 1.4 });
  const strong = fixturePenaltyAwardRate({ baseRate, lambda: 2.8, leagueGoalsPerTeam: 1.4 });
  assert.ok(strong > weak, `${strong} <= ${weak}`);
  assert.ok(strong <= baseRate * 1.5 + 1e-12);
  assert.ok(weak >= baseRate * 0.65 - 1e-12);
});

test("explicit penalty hierarchy becomes player shares", () => {
  const sole = penaltyDutyShares([
    { player_id: 1, penRank: 1, penConfidence: 0.55, pensTaken: 1 },
    { player_id: 2, penRank: 0, pensTaken: 6 },
  ]);
  assert.equal(sole.get(1), 1);
  assert.equal(sole.get(2), 0);

  const split = penaltyDutyShares([
    { player_id: 1, penRank: 1, penConfidence: 0.9, pensTaken: 0 },
    { player_id: 2, penRank: 2, penConfidence: 0.8, pensTaken: 0 },
  ]);
  assert.equal(Number(split.get(1).toFixed(3)), 0.9);
  assert.equal(Number(split.get(2).toFixed(3)), 0.1);
});

test("role-level assist calibration is derived from population evidence", () => {
  const profiles = [];
  for (let i = 0; i < 4; i++) {
    profiles.push({ role: "attacking_creator", minutes: 2700, assists: 12, xa: 8 });
    profiles.push({ role: "holding_midfielder", minutes: 2700, assists: 2, xa: 6 });
  }
  const weights = deriveRoleAssistWeights(profiles);
  assert.ok(weights.attacking_creator > weights.holding_midfielder * 2, JSON.stringify(weights));
});

test("penalty shares concentrate a fixed team goal total onto the taker", () => {
  const cfg = engineConfig(engineJson);
  cfg.formation = squadRules(rules).formation;
  cfg.N = 6000;
  cfg.assistWeight = null;
  cfg.assistRoleWeight = null;
  cfg.roleRates = {
    npxg90: { focal_striker: 0.55, box_to_box_midfielder: 0.12, balanced_defender: 0.04, goalkeeper: 0 },
    xa90: { focal_striker: 0.08, box_to_box_midfielder: 0.14, balanced_defender: 0.05, goalkeeper: 0 },
  };
  const homePlayers = eleven("h", { penRank: 1, penConfidence: 1, penConversion: 1, pensTaken: 5 });
  const awayPlayers = eleven("a");
  const homeAlloc = allocateTeam({ team: { players: homePlayers, promoted: false }, lambda: 2.2, cfg, gw: 1 });
  const awayAlloc = allocateTeam({ team: { players: awayPlayers, promoted: false }, lambda: 1.0, cfg, gw: 1 });

  const run = (penAwardRate, id) => simulateFixture({
    fixture: { id },
    home: { players: homeAlloc.players, penAwardRate },
    away: { players: awayAlloc.players, penAwardRate: 0 },
    lambdas: { lambda_home: 2.2, lambda_away: 1.0 },
    rho: cfg.rho,
    rules,
    table: scoringTable(rules),
    cfg,
    N: cfg.N,
  });

  const without = run(0, "no-pens");
  const withPens = run(0.35, "with-pens");
  const starWithout = summarise(without.samples.get("h-star"), cfg.N);
  const starWith = summarise(withPens.samples.get("h-star"), cfg.N);
  assert.ok(starWith.e_pen_goals > 0.15, starWith.e_pen_goals);
  assert.ok(starWith.e_goals > starWithout.e_goals + 0.1, `${starWith.e_goals} vs ${starWithout.e_goals}`);
  assert.ok(starWith.ep_mean > starWithout.ep_mean + 0.25, `${starWith.ep_mean} vs ${starWithout.ep_mean}`);

  const teamGoals = (result) => homeAlloc.players.reduce(
    (sum, p) => sum + summarise(result.samples.get(p.player_id), cfg.N).e_goals,
    0,
  );
  assert.ok(Math.abs(teamGoals(withPens) - teamGoals(without)) < 0.1, `${teamGoals(withPens)} vs ${teamGoals(without)}`);
});

test("Step 5 runtime loads confidence and fixture-scales penalties", () => {
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(job, /confidence, evidence, source, updated_at/);
  assert.match(job, /shrunkPenaltyAwardRate/);
  assert.match(job, /fixturePenaltyAwardRate/);
  assert.match(job, /assistRoleWeight/);
  assert.match(job, /penConfidence/);
});

test("Understat xG minus npxG recovers penalty-event volume when archive attempts are empty", async () => {
  const { penaltyAttemptsFromExpectedGoals } = await import("../lib/engine/layer2_allocation.mjs");
  assert.equal(Number(penaltyAttemptsFromExpectedGoals(7.6, 6.08, 0.76).toFixed(2)), 2);
  assert.equal(penaltyAttemptsFromExpectedGoals(4, 5, 0.76), 0);
});

test("zero attacking weights never lose sampled team goals", () => {
  const cfg = engineConfig(engineJson);
  cfg.formation = squadRules(rules).formation;
  cfg.N = 5000;
  const zero = (id, position) => basePlayer(id, position, {
    npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0, rateNineties: 0,
    role: null, goals: 0, xg: 0, shots: 0,
  });
  const squad = (prefix) => [
    zero(`${prefix}-gk`, "GKP"),
    ...Array.from({ length: 4 }, (_, i) => zero(`${prefix}-d${i}`, "DEF")),
    ...Array.from({ length: 5 }, (_, i) => zero(`${prefix}-m${i}`, "MID")),
    zero(`${prefix}-f`, "FWD"),
  ];
  const home = { players: squad("h").map((p) => ({ ...p, goalShare: 0, assistShare: 0, finishing: 1 })), penAwardRate: 0 };
  const away = { players: squad("a").map((p) => ({ ...p, goalShare: 0, assistShare: 0, finishing: 1 })), penAwardRate: 0 };
  const result = simulateFixture({
    fixture: { id: "zero-weights" }, home, away,
    lambdas: { lambda_home: 1.6, lambda_away: 1.1 }, rho: cfg.rho,
    rules, table: scoringTable(rules), cfg, N: cfg.N,
  });
  const homeGoals = home.players.reduce((sum, p) => sum + summarise(result.samples.get(p.player_id), cfg.N).e_goals, 0);
  const awayGoals = away.players.reduce((sum, p) => sum + summarise(result.samples.get(p.player_id), cfg.N).e_goals, 0);
  assert.ok(homeGoals > 1.45 && homeGoals < 1.75, homeGoals);
  assert.ok(awayGoals > 0.95 && awayGoals < 1.25, awayGoals);
});
