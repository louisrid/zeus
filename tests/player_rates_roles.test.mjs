import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregateHistoryProfiles, mergeHistoricalProfile } from "../lib/engine/history_profiles.mjs";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";
import { buildRoleModel, attachPlayerRole, classifyPlayerRole } from "../lib/engine/player_roles.mjs";
import { resolvePlayerRates } from "../lib/engine/player_rate_resolver.mjs";
import { allocateTeam, selectLeagueRateMaps } from "../lib/engine/layer2_allocation.mjs";
import { engineConfig } from "../lib/engine/config.mjs";

const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url)));

test("history player-gameweeks become one complete prior profile", () => {
  const profiles = aggregateHistoryProfiles([
    { element: 10, player_name: "Cole Palmer", team: "Chelsea", position: "MID", minutes: 90, started: true, total_points: 8, goals: 1, assists: 0, xg: 0.7, xa: 0.2, cbit: 1, recoveries: 3 },
    { element: 10, player_name: "Cole Palmer", team: "Chelsea", position: "MID", minutes: 80, started: true, total_points: 5, goals: 0, assists: 1, xg: 0.3, xa: 0.6, cbit: 2, recoveries: 4 },
  ]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].minutes, 170);
  assert.equal(profiles[0].starts, 2);
  assert.equal(profiles[0].xg, 1);
  assert.equal(profiles[0].xa, 0.8);
  assert.ok(profiles[0].npxg90 > 0.5);
});

test("history matching handles long names, club aliases and transfers", () => {
  const rows = [
    { player_name: "Bruno Fernandes", team_title: "Man Utd", minutes: 3000, xg: 9, xa: 11 },
    { player_name: "Joao Felix", team_title: "Chelsea,Everton", minutes: 1000, xg: 4, xa: 3 },
  ];
  const bruno = matchExpectedMetricsRow({
    player: { name: "Bruno Miguel Borges Fernandes", team_name: "Manchester United" },
    source: rows,
  });
  const felix = matchExpectedMetricsRow({
    player: { name: "Joao Felix", team_name: "Everton" },
    source: rows,
  });
  assert.equal(bruno?.player_name, "Bruno Fernandes");
  assert.equal(felix?.player_name, "Joao Felix");
});

test("matched expected metrics replace a generic positional rate", () => {
  const matched = { minutes: 2700, xg: 15, xa: 12, npxg: 15 };
  const merged = mergeHistoricalProfile({ minutes: 2700, goals: 20, assists: 10 }, matched);
  const rates = resolvePlayerRates({
    archive: merged,
    understat: null,
    player: null,
    position: "MID",
    leagueRates: { npxg90: { MID: 0.1531 }, xa90: { MID: 0.1262 } },
  });
  assert.equal(rates.source, "archive-expected");
  assert.equal(Number(rates.npxg90.toFixed(3)), 0.5);
  assert.equal(Number(rates.xa90.toFixed(3)), 0.4);
});

function mid(name, npxg90, xa90, cbit90, recoveries90, nineties = 30) {
  return { player_name: name, position: "MID", npxg90, xa90, cbit90, recoveries90, nineties };
}

test("data-derived roles separate creators from holding midfielders", () => {
  const history = [
    mid("Creator A", 0.35, 0.42, 1, 3), mid("Creator B", 0.30, 0.38, 1.2, 3.2),
    mid("Attacker A", 0.42, 0.18, 1, 3), mid("Attacker B", 0.38, 0.16, 1.5, 3),
    mid("Holder A", 0.04, 0.06, 6, 8), mid("Holder B", 0.05, 0.07, 6.5, 8.5),
    mid("Box A", 0.16, 0.15, 3, 5), mid("Box B", 0.18, 0.16, 3.2, 5.2),
    mid("Mixed A", 0.25, 0.28, 2, 4), mid("Mixed B", 0.24, 0.26, 2.2, 4.2),
    mid("Low A", 0.08, 0.10, 3, 4), mid("Low B", 0.09, 0.11, 3, 4),
  ];
  const model = buildRoleModel(history);
  const creator = attachPlayerRole(mid("Creator", 0.34, 0.40, 1, 3), model);
  const holder = attachPlayerRole(mid("Holder", 0.04, 0.05, 7, 9), model);
  assert.ok(["attacking_creator", "creator_midfielder"].includes(creator.role), creator.role);
  assert.equal(holder.role, "holding_midfielder");
  assert.ok(Object.keys(model.rates.npxg90).length >= 2);
});

test("allocation uses the measured kPos and preserves team goal conservation", () => {
  const cfg = engineConfig(engineJson);
  assert.equal(cfg.rateShrinkNineties, cfg.kPos);
  assert.equal(cfg.rateShrinkNineties, 20);
  cfg.roleRates = {
    npxg90: { attacking_creator: 0.32, holding_midfielder: 0.05 },
    xa90: { attacking_creator: 0.34, holding_midfielder: 0.07 },
  };
  cfg.assistWeight = { MID: 1 };
  const team = {
    promoted: false,
    players: [
      { player_id: 1, position: "MID", role: "attacking_creator", npxg90: 0.42, xa90: 0.40, npxgNineties: 30, xaNineties: 30, goals: 10, xg: 9, shots: 80 },
      { player_id: 2, position: "MID", role: "holding_midfielder", npxg90: 0.04, xa90: 0.05, npxgNineties: 30, xaNineties: 30, goals: 1, xg: 1, shots: 15 },
    ],
  };
  const out = allocateTeam({ team, lambda: 2, priors: {}, cfg, gw: 1, promotedPrior: null });
  const creator = out.players.find((p) => p.player_id === 1);
  const holder = out.players.find((p) => p.player_id === 2);
  assert.ok(creator.goalShare > holder.goalShare * 5);
  assert.ok(creator.assistShare > holder.assistShare * 4);
  assert.ok(Math.abs(out.players.reduce((s, p) => s + p.goalShare, 0) - 1) < 1e-12);
  assert.ok(Math.abs(out.players.reduce((s, p) => s + p.assistShare, 0) - 1) < 1e-12);
});

test("Step 4 runtime is wired to full history, roles and used-rate diagnostics", () => {
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  const understat = readFileSync(new URL("../jobs/understat_pull.mjs", import.meta.url), "utf8");
  assert.match(job, /history_player_gw/);
  assert.match(job, /aggregateHistoryProfiles/);
  assert.match(job, /buildRoleModel/);
  assert.match(job, /attachPlayerRole/);
  assert.match(job, /pl\.used_npxg90/);
  assert.match(job, /pl\.used_xa90/);
  assert.match(understat, /matchExpectedMetricsRow/);
});

test("positive fallback rates stop one measured defender absorbing a promoted team's attack", () => {
  const cfg = engineConfig(engineJson);
  cfg.leagueRates = selectLeagueRateMaps({
    currentSeasonRates: {
      npxg90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
      xa90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
      cbit90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
      recoveries90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
    },
    priorSeasonRates: {},
    configuredRates: cfg.leagueRates,
    currentSeasonFinished: 0,
  });
  cfg.roleRates = {};
  cfg.assistWeight = {};
  const players = [
    { player_id: 1, position: "DEF", npxg90: 0.12, xa90: 0.05, npxgNineties: 25, xaNineties: 25, goals: 4, xg: 3.2, shots: 35 },
    { player_id: 2, position: "GKP", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0 },
    ...Array.from({ length: 3 }, (_, i) => ({ player_id: 3 + i, position: "DEF", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0 })),
    ...Array.from({ length: 4 }, (_, i) => ({ player_id: 6 + i, position: "MID", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0 })),
    ...Array.from({ length: 2 }, (_, i) => ({ player_id: 10 + i, position: "FWD", npxg90: 0, xa90: 0, npxgNineties: 0, xaNineties: 0 })),
  ];
  const out = allocateTeam({ team: { promoted: true, players }, lambda: 1.2, priors: {}, cfg, gw: 1, promotedPrior: null });
  const measuredDefender = out.players.find((p) => p.player_id === 1);
  assert.ok(measuredDefender.goalShare < 0.25, measuredDefender.goalShare);
  for (const p of out.players.filter((p) => p.position !== "GKP")) {
    assert.ok(p.used_npxg90 > 0, `${p.player_id}: ${p.used_npxg90}`);
    assert.ok(p.used_xa90 > 0, `${p.player_id}: ${p.used_xa90}`);
  }
});
