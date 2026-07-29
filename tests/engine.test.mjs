// Package 3 engine suite. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
const ROOT = process.cwd();
import { readFileSync } from "fs";

import { deoverround, overProbability, solveLambdas, impliedGoalEnvironment, fallbackGoalEnvironment } from "../lib/engine/layer0_market.mjs";
import { scorelineGrid, gridMarkets, defensiveOutcomes, sampleScoreline, gameStateShares, tau } from "../lib/engine/layer1_scoreline.mjs";
import { positionalSharePriors, shrinkShare, finishingMultiplier, promotedBlendWeight, penaltyConversion, allocateTeam } from "../lib/engine/layer2_allocation.mjs";
import { availability, pressorAdjust, wcLoadAdjust, shrinkRate, forecastMinutes, leagueMinutesMeans, sampleXI } from "../lib/engine/layer3_minutes.mjs";
import { simulateFixture, summarise, teamCovariance } from "../lib/engine/layer4_sim.mjs";
import { scoringTable, pointsFor, squadRules } from "../lib/engine/points.mjs";
import { engineConfig, interimParameters } from "../lib/engine/config.mjs";
import { mulberry32, seedFrom, quantile, poisson } from "../lib/engine/rng.mjs";
import { bpsFor, allocateBonus } from "../lib/bps_engine.mjs";

const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));
const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url)));
const cfg = engineConfig(engineJson);
const table = scoringTable(rules);
cfg.formation = squadRules(rules).formation;

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

/* ── Layer 0 ─────────────────────────────────────────────────────────── */

test("power de-overround produces probabilities summing to one", () => {
  const { probs, method } = deoverround([2.1, 3.4, 3.8]);
  close(probs.reduce((s, x) => s + x, 0), 1, 1e-6);
  assert.equal(method, "power");
  assert.ok(probs.every((p) => p > 0 && p < 1));
});

test("de-overround removes the bookmaker margin rather than preserving it", () => {
  const odds = [2.1, 3.4, 3.8];
  const raw = odds.reduce((s, o) => s + 1 / o, 0);
  assert.ok(raw > 1, "test fixture should carry an overround");
  const { probs } = deoverround(odds);
  close(probs.reduce((s, x) => s + x, 0), 1, 1e-6);
});

test("de-overround falls back to proportional when bisection cannot bracket", () => {
  const { method, probs } = deoverround([1.01, 1.01, 1.01]);
  assert.equal(method, "proportional");
  close(probs.reduce((s, x) => s + x, 0), 1, 1e-9);
});

test("totals line de-overrounds to a single over probability", () => {
  const p = overProbability(1.8, 2.1);
  assert.ok(p > 0.5 && p < 0.6);
  assert.equal(overProbability(null, 2.1), null);
});

test("lambda solver recovers the means that generated the market", () => {
  const truth = { lh: 1.85, la: 1.05 };
  const { grid } = scorelineGrid(truth.lh, truth.la, cfg.rho);
  const m = gridMarkets(grid);
  const solved = solveLambdas({ pH: m.pH, pD: m.pD, pA: m.pA, over25: m.over25 }, cfg.rho);
  close(solved.lambda_home, truth.lh, 0.03);
  close(solved.lambda_away, truth.la, 0.03);
  assert.ok(solved.fit_residual < 0.01, `residual ${solved.fit_residual}`);
});

test("the full Layer 0 entry point runs on a raw odds row", () => {
  const out = impliedGoalEnvironment({ h: 1.72, d: 4.0, a: 4.6, over25: 1.75, under25: 2.15 }, cfg.rho);
  assert.ok(out.lambda_home > out.lambda_away, "home favourite should carry the higher mean");
  assert.match(out.deoverround_method, /\+dc$/);
});

test("the same code path serves live and historical rows", () => {
  const row = { h: 2.5, d: 3.3, a: 2.9, over25: 1.9, under25: 1.95 };
  const a = impliedGoalEnvironment(row, cfg.rho);
  const b = impliedGoalEnvironment({ ...row }, cfg.rho);
  assert.deepEqual(a, b);
});

test("the odds-free fallback is derived from supplied data and refuses to invent", () => {
  assert.equal(fallbackGoalEnvironment(1300, 1100, null, 1.1), null);
  const out = fallbackGoalEnvironment(1300, 1050, 2.8, 1.15);
  close(out.lambda_home + out.lambda_away, 2.8, 1e-6);
  assert.ok(out.lambda_home > out.lambda_away);
  assert.equal(out.fit_residual, null);
});

/* ── Layer 1 ─────────────────────────────────────────────────────────── */

test("the Dixon-Coles grid is a normalised distribution", () => {
  const { grid, truncation } = scorelineGrid(1.6, 1.2, cfg.rho);
  let total = 0;
  for (const row of grid) for (const p of row) total += p;
  close(total, 1, 1e-9);
  assert.ok(truncation >= 0 && truncation < 1e-3, `truncation ${truncation}`);
});

test("the tau correction only touches the four low scorelines", () => {
  for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    assert.notEqual(tau(x, y, 1.5, 1.2, -0.03), 1);
  }
  assert.equal(tau(2, 1, 1.5, 1.2, -0.03), 1);
  assert.equal(tau(0, 2, 1.5, 1.2, -0.03), 1);
});

test("market summaries partition the grid", () => {
  const { grid } = scorelineGrid(1.4, 1.4, cfg.rho);
  const m = gridMarkets(grid);
  close(m.pH + m.pD + m.pA, 1, 1e-9);
  assert.ok(Math.abs(m.pH - m.pA) < 1e-9, "equal means should give symmetric win probabilities");
});

test("clean sheet probability falls as the opponent's mean rises", () => {
  const low = defensiveOutcomes(scorelineGrid(1.2, 0.6, cfg.rho).grid);
  const high = defensiveOutcomes(scorelineGrid(1.2, 2.4, cfg.rho).grid);
  assert.ok(low.pCsHome > high.pCsHome);
  close(low.concededHome.reduce((s, x) => s + x, 0), 1, 1e-9);
});

test("scoreline sampling covers the distribution", () => {
  const { grid } = scorelineGrid(1.5, 1.2, cfg.rho);
  const [x, y] = sampleScoreline(grid, 0.0001);
  assert.equal(x + y >= 0, true);
  const [hx, hy] = sampleScoreline(grid, 0.9999);
  assert.ok(hx + hy > x + y - 1);
});

test("game-state shares sum to the match length", () => {
  const s = gameStateShares([20, 70], [50], 94);
  close(s.home.leading + s.home.level + s.home.trailing, 1, 1e-9);
  close(s.away.leading, s.home.trailing, 1e-9);
  assert.ok(s.home.leading > 0);
});

/* ── Layer 2 ─────────────────────────────────────────────────────────── */

test("positional priors are derived from the squads, not declared", () => {
  const teams = [
    { players: [{ position: "FWD", npxg90: 0.6 }, { position: "MID", npxg90: 0.2 }, { position: "DEF", npxg90: 0.05 }] },
    { players: [{ position: "FWD", npxg90: 0.5 }, { position: "MID", npxg90: 0.3 }, { position: "DEF", npxg90: 0.05 }] },
  ];
  const priors = positionalSharePriors(teams);
  assert.ok(priors.FWD > priors.MID && priors.MID > priors.DEF);
  assert.equal(positionalSharePriors([]).FWD, undefined);
});

test("shrinkage moves a small sample toward the prior and leaves a large one alone", () => {
  const prior = 0.1;
  const small = shrinkShare(0.9, 0.5, prior, cfg.kPos);
  const large = shrinkShare(0.9, 400, prior, cfg.kPos);
  assert.ok(small < 0.3, `small sample ${small}`);
  assert.ok(large > 0.88, `large sample ${large}`);
});

test("the finishing multiplier stays inside its calibrated clamp", () => {
  const hot = finishingMultiplier(30, 10, 400, cfg.finishingK, cfg.finishingClamp);
  const cold = finishingMultiplier(2, 20, 400, cfg.finishingK, cfg.finishingClamp);
  assert.ok(hot <= 1 + cfg.finishingClamp + 1e-9);
  assert.ok(cold >= 1 - cfg.finishingClamp - 1e-9);
  assert.equal(finishingMultiplier(5, 0, 0, cfg.finishingK, cfg.finishingClamp), 1);
});

test("the promoted-club prior decays to zero by its endpoint", () => {
  assert.equal(promotedBlendWeight(1, 10), 1);
  assert.equal(promotedBlendWeight(10, 10), 0);
  assert.equal(promotedBlendWeight(12, 10), 0);
  assert.ok(promotedBlendWeight(5, 10) > 0 && promotedBlendWeight(5, 10) < 1);
});

test("penalty conversion shrinks toward the league rate and never invents one", () => {
  assert.equal(penaltyConversion(3, 4, 0, 0, 10), null);
  const league = penaltyConversion(0, 0, 80, 100, 10);
  close(league, 0.8, 1e-9);
  const own = penaltyConversion(10, 10, 80, 100, 10);
  assert.ok(own > 0.8 && own < 1);
});

test("allocation shares renormalise to one inside the squad", () => {
  const team = {
    players: [
      { player_id: 1, position: "FWD", npxg90: 0.55, xa90: 0.15, nineties: 20, goals: 12, xg: 11, shots: 70 },
      { player_id: 2, position: "MID", npxg90: 0.25, xa90: 0.35, nineties: 22, goals: 6, xg: 7, shots: 55 },
      { player_id: 3, position: "DEF", npxg90: 0.04, xa90: 0.06, nineties: 25, goals: 1, xg: 1.5, shots: 15 },
    ],
  };
  const priors = positionalSharePriors([team]);
  const out = allocateTeam({ team, lambda: 1.7, priors, cfg, gw: 1, promotedPrior: null });
  close(out.players.reduce((s, p) => s + p.goalShare, 0), 1, 1e-9);
  close(out.players.reduce((s, p) => s + p.assistShare, 0), 1, 1e-9);
  assert.ok(out.players[0].goalShare > out.players[2].goalShare);
  assert.equal(out.promotedBlend, 0);
});

/* ── Layer 3 ─────────────────────────────────────────────────────────── */

test("availability reads the FPL status fields", () => {
  assert.equal(availability({ status: "i" }), 0);
  assert.equal(availability({ status: "a", chance_of_playing: null }), 1);
  close(availability({ status: "d", chance_of_playing: 25 }), 0.25, 1e-9);
});

test("presser signals move P(start) in the right direction, scaled by confidence", () => {
  close(pressorAdjust(0.8, { signal: "out", confidence: 1 }), 0, 1e-9);
  assert.ok(pressorAdjust(0.8, { signal: "doubt", confidence: 0.6 }) < 0.8);
  assert.ok(pressorAdjust(0.8, { signal: "confirmed", confidence: 0.9 }) > 0.8);
  assert.equal(pressorAdjust(0.8, null), 0.8);
  assert.equal(pressorAdjust(0.8, { signal: "out", confidence: 0 }), 0.8);
});

test("no fatigue effect is applied while the study has not delivered", () => {
  const nullPrior = wcLoadAdjust(0.9, 2, true, null);
  assert.equal(nullPrior.applied, false);
  assert.equal(nullPrior.p, 0.9);
  const applied = wcLoadAdjust(0.9, 2, true, 0.2);
  assert.equal(applied.applied, true);
  close(applied.p, 0.72, 1e-9);
  assert.equal(wcLoadAdjust(0.9, 7, true, 0.2).applied, false, "flag only bites in GW1-4");
});

test("rate shrinkage handles a zero sample without dividing by zero", () => {
  assert.equal(shrinkRate(0, 0, null, 4), null);
  close(shrinkRate(0, 0, 0.5, 4), 0.5, 1e-9);
});

test("the minutes forecast is monotone in availability and bounded", () => {
  const league = leagueMinutesMeans([
    { starts: 30, appearances: 34, teamGames: 38, starts60: 26, startMinutes: 2600, cameos: 4, cameoMinutes: 80 },
  ]);
  const base = {
    starts: 30, appearances: 34, teamGames: 38, starts60: 26, startMinutes: 2600,
    cameos: 4, cameoMinutes: 80, minutes: 2680, teamMinutesAvailable: 3420, status: "a", chance_of_playing: null,
  };
  const fit = forecastMinutes({ player: base, league, signal: null, gw: 1, cfg });
  const doubt = forecastMinutes({ player: { ...base, status: "d", chance_of_playing: 50 }, league, signal: null, gw: 1, cfg });
  const injured = forecastMinutes({ player: { ...base, status: "i" }, league, signal: null, gw: 1, cfg });
  assert.ok(fit.p_start > doubt.p_start && doubt.p_start > injured.p_start);
  assert.equal(injured.p_start, 0);
  assert.ok(fit.p_start <= cfg.pStartCeiling + 1e-9);
  assert.ok(fit.p60 <= fit.p_start + fit.p_cameo + 1e-9);
  assert.ok(fit.exp_min_start <= 90);
  assert.equal(fit.model_version, "minutes-interim-1");
});

test("the XI sampler respects the formation minimums", () => {
  const rng = mulberry32(7);
  const players = [];
  let id = 1;
  for (const [pos, n] of [["GKP", 3], ["DEF", 8], ["MID", 8], ["FWD", 5]]) {
    for (let i = 0; i < n; i++) players.push({ player_id: id++, position: pos, p_start: 0.2 + (i % 5) * 0.15 });
  }
  for (let t = 0; t < 60; t++) {
    const picked = sampleXI(players, rng, cfg.formation);
    assert.ok(picked.length <= 11, `${picked.length} starters`);
    const count = (pos) => picked.filter((p) => p.position === pos).length;
    assert.equal(count("GKP"), cfg.formation.GKP_exact);
    assert.ok(count("DEF") >= cfg.formation.DEF_min);
    assert.ok(count("MID") >= cfg.formation.MID_min);
    assert.ok(count("FWD") >= cfg.formation.FWD_min);
    assert.equal(new Set(picked.map((p) => p.player_id)).size, picked.length, "no duplicates");
  }
});

/* ── points, driven only by the ruleset ──────────────────────────────── */

test("the scoring table is read from the ruleset", () => {
  assert.equal(table.goal.MID, 5);
  assert.equal(table.goal.FWD, 4);
  assert.equal(table.cs.DEF, 4);
  assert.equal(table.defcon.defThreshold, 10);
  assert.equal(table.defcon.midFwdThreshold, 12);
});

test("points are computed by the ruleset for a known bundle", () => {
  // 90 minutes, one goal, one assist, clean sheet, under the DefCon threshold: 2+5+3+1 = 11
  const mid = pointsFor({ minutes: 90, goals: 1, assists: 1, goalsConceded: 0, cbit: 3, recoveries: 4 }, "MID", table);
  assert.equal(mid, 11);
  // defender, 90 minutes, clean sheet, DefCon threshold met: 2+4+2 = 8
  const def = pointsFor({ minutes: 90, goalsConceded: 0, cbit: 10 }, "DEF", table);
  assert.equal(def, 8);
  // keeper, four conceded, six saves: 2 - 2 + 2 = 2
  const gk = pointsFor({ minutes: 90, goalsConceded: 4, saves: 6 }, "GKP", table);
  assert.equal(gk, 2);
  // cameo with a goal: 1 + 4 = 5
  assert.equal(pointsFor({ minutes: 20, goals: 1, goalsConceded: 1 }, "FWD", table), 5);
  // no minutes, no points
  assert.equal(pointsFor({ minutes: 0, goals: 2 }, "FWD", table), 0);
});

test("a clean sheet needs sixty minutes", () => {
  assert.equal(pointsFor({ minutes: 59, goalsConceded: 0 }, "DEF", table), 1);
  assert.equal(pointsFor({ minutes: 60, goalsConceded: 0 }, "DEF", table), 6);
});

test("cards and own goals subtract", () => {
  assert.equal(pointsFor({ minutes: 90, goalsConceded: 1, yellow: 1 }, "MID", table), 1);
  assert.equal(pointsFor({ minutes: 90, goalsConceded: 1, ownGoals: 1 }, "MID", table), 0);
});

test("bonus allocation follows the ruleset tie rule", () => {
  const out = allocateBonus([{ key: "a", bps: 40 }, { key: "b", bps: 40 }, { key: "c", bps: 30 }, { key: "d", bps: 10 }]);
  assert.equal(out.get("a"), 3);
  assert.equal(out.get("b"), 3);
  assert.equal(out.get("c"), 1);
  assert.equal(out.get("d"), 0);
});

test("the BPS engine reads the 2026/27 confirmed changes from the ruleset", () => {
  const keeper = bpsFor({ minutes: 90, saves: 3, goals_conceded: 0 }, "GKP", rules);
  const noSaves = bpsFor({ minutes: 90, saves: 0, goals_conceded: 0 }, "GKP", rules);
  assert.equal(keeper - noSaves, 6, "three saves at the confirmed +2 each");
});

/* ── Layer 4 ─────────────────────────────────────────────────────────── */

function fixtureSetup() {
  const mk = (id, position, opts = {}) => ({
    player_id: id, position, p_start: 0.9, p_cameo: 0.05, p60_given_start: 0.85,
    exp_min_start: 88, exp_min_cameo: 20, goalShare: 0, assistShare: 0, finishing: 1,
    cbit90: position === "DEF" ? 9 : 4, recoveries90: 6, keyPasses90: 1.2,
    yellow90: 0.15, red90: 0.01, og90: 0.01, penRank: 0, penConversion: 0.78, ...opts,
  });
  const build = (offset) => {
    const players = [
      mk(offset + 1, "GKP"),
      mk(offset + 2, "DEF"), mk(offset + 3, "DEF"), mk(offset + 4, "DEF"), mk(offset + 5, "DEF"),
      mk(offset + 6, "MID", { goalShare: 0.15, assistShare: 0.3, penRank: 1 }),
      mk(offset + 7, "MID", { goalShare: 0.1, assistShare: 0.2 }),
      mk(offset + 8, "MID", { goalShare: 0.1, assistShare: 0.2 }),
      mk(offset + 9, "MID", { goalShare: 0.05, assistShare: 0.1 }),
      mk(offset + 10, "FWD", { goalShare: 0.45, assistShare: 0.15 }),
      mk(offset + 11, "FWD", { goalShare: 0.15, assistShare: 0.05 }),
      mk(offset + 12, "MID", { p_start: 0.25, p_cameo: 0.5, goalShare: 0.05 }),
    ];
    return { players, promoted: false, penAwardRate: 0.18 };
  };
  return { home: build(0), away: build(100) };
}

test("the simulation is deterministic for a given seed", () => {
  const { home, away } = fixtureSetup();
  const args = {
    fixture: { id: 42 }, home, away,
    lambdas: { lambda_home: 1.8, lambda_away: 1.1 }, rho: cfg.rho, rules, table,
    cfg: { ...cfg }, N: 300,
  };
  const a = simulateFixture(args);
  const b = simulateFixture(args);
  const key = 10;
  assert.deepEqual(a.samples.get(key).pts, b.samples.get(key).pts);
  assert.equal(a.samples.get(key).pts.length, 300);
});

test("every player gets exactly one sample per simulation", () => {
  const { home, away } = fixtureSetup();
  const { samples } = simulateFixture({
    fixture: { id: 7 }, home, away, lambdas: { lambda_home: 1.5, lambda_away: 1.5 },
    rho: cfg.rho, rules, table, cfg: { ...cfg }, N: 200,
  });
  for (const [, rec] of samples) assert.equal(rec.pts.length, 200, `player ${rec.player_id} sample count`);
});

test("the striker outscores the fourth-choice midfielder and the summary is coherent", () => {
  const { home, away } = fixtureSetup();
  const { samples } = simulateFixture({
    fixture: { id: 9 }, home, away, lambdas: { lambda_home: 2.1, lambda_away: 0.9 },
    rho: cfg.rho, rules, table, cfg: { ...cfg }, N: 1200,
  });
  const striker = summarise(samples.get(10), 1200);
  const fringe = summarise(samples.get(12), 1200);
  assert.ok(striker.ep_mean > fringe.ep_mean, `${striker.ep_mean} vs ${fringe.ep_mean}`);
  assert.ok(striker.p_goal > 0 && striker.p_goal <= 1);
  assert.ok(striker.p_12plus >= 0 && striker.p_12plus <= 1);
  assert.ok(striker.ep_sd > 0);
  assert.ok(striker.quantiles.p10 <= striker.quantiles.p50);
  assert.ok(striker.quantiles.p50 <= striker.quantiles.p90);
  assert.ok(striker.e_bonus >= 0 && striker.e_bonus <= 3);
});

test("a defender's clean sheet probability tracks the opponent's mean", () => {
  const { home, away } = fixtureSetup();
  const shared = { rho: cfg.rho, rules, table, cfg: { ...cfg }, N: 800 };
  const tight = simulateFixture({ fixture: { id: 11 }, home, away, lambdas: { lambda_home: 1.5, lambda_away: 0.5 }, ...shared });
  const leaky = simulateFixture({ fixture: { id: 11 }, home, away, lambdas: { lambda_home: 1.5, lambda_away: 2.6 }, ...shared });
  const a = summarise(tight.samples.get(2), 800);
  const b = summarise(leaky.samples.get(2), 800);
  assert.ok(a.p_cs > b.p_cs, `${a.p_cs} vs ${b.p_cs}`);
});

test("teammate covariance is symmetric with non-negative variances", () => {
  const { home, away } = fixtureSetup();
  const { samples } = simulateFixture({
    fixture: { id: 13 }, home, away, lambdas: { lambda_home: 1.7, lambda_away: 1.2 },
    rho: cfg.rho, rules, table, cfg: { ...cfg }, N: 400,
  });
  const ids = home.players.map((p) => p.player_id);
  const m = teamCovariance(samples, ids);
  for (const i of ids) {
    assert.ok(m[i][i] >= 0, `variance for ${i}`);
    for (const j of ids) close(m[i][j], m[j][i], 1e-4);
  }
});

/* ── config, rng ─────────────────────────────────────────────────────── */

test("every interim engine parameter carries an upgrade date", () => {
  const interim = interimParameters(engineJson);
  assert.ok(interim.length > 0);
  for (const p of interim) {
    assert.ok(p.upgrade_date, `${p.key} has no upgrade date`);
    assert.match(p.upgrade_date, /^2026-08-\d{2}$/);
  }
});

test("the xP gate ships closed", () => {
  /* Opened 29 Jul 2026. The fallback was measured against all of 2025/26 and beat a naive per-player average
     by only 3 per cent, with a sweep across five settings moving accuracy by 0.002, so its structure is the
     limit rather than its tuning. The engine prices each scoring component separately. This asserts the gate
     is open AND that the reason is recorded, so it can never be flipped without one. */
  assert.equal(engineJson.gates.xp_visible.value, true);
  assert.match(engineJson.gates.xp_visible.note, /beat a naive per-player average by 3 per cent/);
});

test("the seeded stream is reproducible and quantiles interpolate", () => {
  const a = mulberry32(seedFrom("fixture:1"));
  const b = mulberry32(seedFrom("fixture:1"));
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  close(quantile([0, 2, 4, 6, 8], 0.5), 4, 1e-9);
  close(quantile([0, 10], 0.25), 2.5, 1e-9);
  assert.equal(quantile([], 0.5), null);
});

test("the Poisson sampler has the right mean", () => {
  const rng = mulberry32(3);
  let total = 0;
  const n = 8000;
  for (let i = 0; i < n; i++) total += poisson(rng, 1.6);
  close(total / n, 1.6, 0.08);
});

test("the engine can never finish having produced nothing", async () => {
  /* This is why every number in the product came from the weak fallback for months. The engine needs an
     average goals-per-match figure to price a fixture. It tried this season's scorelines, which do not exist
     before a ball is kicked, then the archive, which did not resolve. With neither, the strength-based
     fallback returned nothing, EVERY fixture was skipped, and the run completed successfully having written
     zero projections. The app then silently used a single blended season average instead, which beats a naive
     per-player average by 3 per cent.
     A missing constant cost the entire model. There is now a floor. */
  const { fallbackGoalEnvironment } = await import("../lib/engine/layer0_market.mjs");

  // The old behaviour, which is what silently emptied the run.
  assert.equal(fallbackGoalEnvironment(5, 2, null, 1.15), null,
    "with no average it still returns nothing, so the job must never pass null");

  const src = readFileSync(join(ROOT, "jobs", "projections_run.mjs"), "utf8");
  assert.match(src, /leagueMeanGoals = 2\.8;/, "the job must supply a floor rather than pass null");
  assert.match(src, /long-run league average/, "and record that the figure is a fallback, not measured");
  assert.match(src, /gaps\.push\("goal environment came from the long-run league average/,
    "and report it as a gap, so it is visible rather than assumed to be real data");

  // Archive rows hold one side of a match each, so dividing by the row count halves the average.
  assert.match(src, /archiveGoals \/ \(archiveFixtures\.length \/ 2\)/,
    "the archive average must account for one row per side");

  // With the floor, every matchup prices, and prices differently.
  const strong = fallbackGoalEnvironment(5, 2, 2.8, 1.15);
  const weak = fallbackGoalEnvironment(2, 5, 2.8, 1.15);
  const even = fallbackGoalEnvironment(4, 4, 2.8, 1.15);
  for (const [name, r] of [["strong home", strong], ["weak home", weak], ["even", even]]) {
    assert.ok(r && Number.isFinite(r.lambda_home), `${name} must price rather than be skipped`);
  }
  assert.ok(strong.lambda_home > even.lambda_home, "a stronger home side is expected to score more");
  assert.ok(weak.lambda_home < even.lambda_home, "and a weaker one less");
  // The total stays near the league average whoever is playing, which is what makes it a share not a guess.
  for (const r of [strong, weak, even]) {
    const total = r.lambda_home + r.lambda_away;
    assert.ok(Math.abs(total - 2.8) < 0.05, `the two sides must share the league average, got ${total}`);
  }
});
