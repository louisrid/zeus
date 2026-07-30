import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sampleRealXI, normaliseRealStarts } from "../lib/engine/lineup_sampler_v2.mjs";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";
import { resolvePlayerRates, reliableRate } from "../lib/engine/player_rate_resolver.mjs";
import { applyLineupEvidence } from "../lib/engine/lineup_evidence.mjs";

function rngFactory(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const player = (id, position, pStart) => ({
  player_id: id,
  position,
  p_start: pStart,
  p_cameo: 0.08,
  p60_given_start: 0.9,
});

test("real XI never enforces an FPL-forward minimum and preserves low-start marginals", () => {
  const players = [
    player(1, "GKP", 0.95), player(2, "GKP", 0.05),
    ...Array.from({ length: 7 }, (_, i) => player(10 + i, "DEF", i < 4 ? 0.9 : 0.25)),
    ...Array.from({ length: 9 }, (_, i) => player(30 + i, "MID", i < 6 ? 0.88 : 0.3)),
    player(99, "FWD", 0.165),
  ];
  normaliseRealStarts(players, { pStartCeiling: 0.995, earlySubShare: 0.17 });
  const target = players.find((p) => p.player_id === 99).p_start;
  const rng = rngFactory();
  let starts = 0;
  const n = 15000;
  for (let i = 0; i < n; i++) {
    const xi = sampleRealXI(players, rng);
    assert.equal(xi.length, 11);
    assert.equal(xi.filter((p) => p.position === "GKP").length, 1);
    const defs = xi.filter((p) => p.position === "DEF").length;
    assert.ok(defs >= 3 && defs <= 5);
    if (xi.some((p) => p.player_id === 99)) starts++;
  }
  const observed = starts / n;
  assert.ok(observed < 0.35, `sole FWD was still forced: ${observed}`);
  assert.ok(Math.abs(observed - target) < 0.035, `marginal ${observed} differs from p_start ${target}`);
});

test("start probabilities reconcile to one goalkeeper and ten outfielders", () => {
  const players = [
    player(1, "GKP", 0.7), player(2, "GKP", 0.4),
    ...Array.from({ length: 16 }, (_, i) => player(10 + i, i < 6 ? "DEF" : i < 12 ? "MID" : "FWD", 0.35 + (i % 4) * 0.1)),
  ];
  normaliseRealStarts(players, { pStartCeiling: 0.995, earlySubShare: 0.17 });
  const gk = players.filter((p) => p.position === "GKP").reduce((s, p) => s + p.p_start, 0);
  const outfield = players.filter((p) => p.position !== "GKP").reduce((s, p) => s + p.p_start, 0);
  assert.ok(Math.abs(gk - 1) < 1e-8, gk);
  assert.ok(Math.abs(outfield - 10) < 1e-8, outfield);
});

test("name and team aliases recover established-player Understat rows", () => {
  const rows = [
    { player_name: "Bruno Fernandes", team_title: "Manchester United", npxG: 9, xA: 11, minutes: 3000 },
    { player_name: "Beto", team_title: "Everton", npxG: 5, xA: 1, minutes: 900 },
  ];
  const match = matchExpectedMetricsRow({
    player: { first_name: "Bruno Miguel", second_name: "Borges Fernandes", web_name: "Bruno", team_name: "Manchester United" },
    source: rows,
  });
  // Full legal names can differ. The surname/team match is allowed only when unique.
  assert.equal(match?.player_name, "Bruno Fernandes");
});

test("rate resolver never substitutes actual goals or assists for expected metrics", () => {
  const leagueRates = { npxg90: { FWD: 0.41 }, xa90: { FWD: 0.06 } };
  const resolved = resolvePlayerRates({
    archive: { minutes: 810, goals: 12, assists: 8 },
    understat: null,
    player: { goals_per_90: 1.33, assists_per_90: 0.88 },
    position: "FWD",
    leagueRates,
  });
  assert.equal(resolved.source, "prior-positional");
  assert.equal(resolved.npxg90, 0.41);
  assert.equal(resolved.xa90, 0.06);
});

test("measured expected metrics are used before positional priors", () => {
  const resolved = resolvePlayerRates({
    archive: { minutes: 900, non_penalty_xg: 5, expected_assists: 2, goals: 12, assists: 8 },
    understat: null,
    position: "MID",
    leagueRates: { npxg90: { MID: 0.15 }, xa90: { MID: 0.12 } },
  });
  assert.equal(resolved.source, "archive-expected");
  assert.equal(resolved.npxg90, 0.5);
  assert.equal(resolved.xa90, 0.2);
});

test("hot short samples shrink once while established elite rates remain separated", () => {
  const short = reliableRate({ rate: 0.635, nineties: 9, prior: 0.41, k: 12 });
  assert.ok(short > 0.41 && short < 0.52, short);
  const established = reliableRate({ rate: 0.78, nineties: 100, prior: 0.41, k: 12 });
  assert.ok(established > 0.73, established);
});


test("unofficial predicted XI is blended before simulation and never becomes certainty", () => {
  const forecast = { p_start: 0.28, p_cameo: 0.38, p60_given_start: 0.75, exp_min_start: 76, exp_min_cameo: 12 };
  const lineups = { official: false, confidence: 0.75, clubs: { NEW: ["Osula"] } };
  const resolved = applyLineupEvidence({
    forecast, player: { web_name: "Osula" }, team: { short_name: "NEW", name: "Newcastle" }, lineups, cfg: { pStartCeiling: 0.98, earlySubShare: 0.17 },
  });
  assert.ok(resolved.p_start >= 0.83 && resolved.p_start < 0.98, resolved.p_start);
  assert.equal(resolved.lineup_confidence, 0.75);
});
test("source contracts prevent all known structural projection regressions", () => {
  const score = readFileSync(new URL("../lib/solver/score.mjs", import.meta.url), "utf8");
  const minutes = readFileSync(new URL("../lib/engine/layer3_minutes.mjs", import.meta.url), "utf8");
  const sim = readFileSync(new URL("../lib/engine/layer4_sim.mjs", import.meta.url), "utf8");
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  const allocation = readFileSync(new URL("../lib/engine/layer2_allocation.mjs", import.meta.url), "utf8");
  const projections = readFileSync(new URL("../lib/projections.js", import.meta.url), "utf8");

  assert.ok(!score.includes("Math.min(1, share / 0.85)"), "scoreOf still double-counts minutes");
  assert.ok(!score.includes("Math.min(1, played / 0.85)"), "scoreForGw still double-counts minutes");
  assert.ok(!score.includes("ep_mean <"), "valid engine rows can still be rejected by a numerical stale heuristic");
  assert.ok(!minutes.includes("formation.FWD_min"), "XI sampler still forces a fantasy forward");
  assert.ok(!minutes.includes("return normaliseRealStarts(players, cfg)"), "published-XI normalisation was overwritten");
  assert.ok(sim.includes("concededGoalMinutes"), "goals conceded are not tied to player on-pitch intervals");
  const stateDeclarations = sim.match(/^\s*const\s+stateMult\s*=/gm) || [];
  assert.equal(stateDeclarations.length, 1, "stateMult must be a live declaration, not part of a comment");
  assert.ok(sim.includes("shares.leading - shares.trailing"), "DEFCON game-state sign remains reversed");
  assert.ok(!job.includes("build(fx.home_team, false)"), "promoted home team remains hard-coded false");
  assert.ok(!job.includes("build(fx.away_team, false)"), "promoted away team remains hard-coded false");
  assert.ok(job.includes("resolvePlayerRates"), "safe expected-metric resolver is not wired into the run");
  assert.ok(job.includes("matchExpectedMetricsRow"), "established-player data matcher is not wired into the run");
  assert.ok(!job.match(/goals\s*\/\s*.*ninet/i), "actual goals are still used as npxG");
  assert.ok(!allocation.slice(allocation.indexOf("export function allocateTeam")).includes("shrinkShare("), "attacking ability is still shrunk twice");
  assert.ok(job.includes("applyLineupEvidence"), "predicted XI evidence is not resolved inside the engine");
  assert.ok(projections.length > 0, "projection loader source is missing");
});

test("unofficial single-source lineups cannot claim certainty", () => {
  const path = new URL("../config/lineups.json", import.meta.url);
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data.official) assert.ok(Number(data.confidence) >= 0.7 && Number(data.confidence) < 1, data.confidence);
});
