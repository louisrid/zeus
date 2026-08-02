import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";
import {
  allocateTeam,
  deriveConservativeNoHistoryRates,
  promotedRateBlendWeight,
} from "../lib/engine/layer2_allocation.mjs";

const leagueRates = {
  npxg90: { GKP: 0.0002, DEF: 0.0572, MID: 0.1531, FWD: 0.4098 },
  xa90: { GKP: 0.0018, DEF: 0.0579, MID: 0.1262, FWD: 0.0603 },
};

function historyProfiles() {
  const rows = [];
  const rates = {
    GKP: [[0, 0], [0, 0.001], [0.001, 0.002]],
    DEF: [[0.02, 0.03], [0.04, 0.05], [0.08, 0.08]],
    MID: [[0.04, 0.05], [0.10, 0.09], [0.25, 0.20]],
    FWD: [[0.15, 0.03], [0.30, 0.05], [0.70, 0.10]],
  };
  for (const [position, values] of Object.entries(rates)) {
    for (const [npxg90, xa90] of values) rows.push({ position, nineties: 20, npxg90, xa90 });
  }
  return rows;
}

function cfg() {
  return {
    leagueRates,
    noHistoryRates: deriveConservativeNoHistoryRates(historyProfiles(), leagueRates, 10),
    roleRates: {},
    assistWeight: {},
    rateShrinkNineties: 20,
    kPos: 20,
    promotedDecayToGw: 10,
    finishingK: 40,
    finishingClamp: 0.2,
  };
}

function player(player_id, position, nineties = 0, rateSource = "prior-positional") {
  return {
    player_id,
    position,
    npxg90: leagueRates.npxg90[position],
    xa90: leagueRates.xa90[position],
    npxgNineties: nineties,
    xaNineties: nineties,
    rate_source: rateSource,
    goals: 0,
    xg: 0,
    shots: 0,
  };
}

test("cross-club history matching requires a full name or unique initial plus surname", () => {
  const rows = [
    { player_name: "Adam Smith", team_title: "Bournemouth" },
    { player_name: "John Smith", team_title: "Liverpool" },
    { player_name: "Carlos Gomes", team_title: "Wolves" },
  ];
  assert.equal(matchExpectedMetricsRow({
    player: { name: "Peter Smith", team_name: "Hull" }, source: rows,
  }), null, "a shared surname must never import somebody else's history");
  assert.equal(matchExpectedMetricsRow({
    player: { name: "Carlos Bell", team_name: "Hull" }, source: rows,
  }), null, "a shared first name must never import somebody else's history");
  assert.equal(matchExpectedMetricsRow({
    player: { name: "Carlos Gomes", team_name: "Aston Villa" }, source: rows,
  })?.player_name, "Carlos Gomes", "an exact full name survives a transfer");
});

test("initial-plus-surname transfer matching is accepted only when unique", () => {
  const unique = [{ player_name: "Bruno Fernandes", team_title: "Manchester United" }];
  assert.equal(matchExpectedMetricsRow({
    player: { name: "Bruno Miguel Borges Fernandes", team_name: "Another Club" }, source: unique,
  })?.player_name, "Bruno Fernandes");

  const ambiguous = [
    { player_name: "Ben White", team_title: "Arsenal" },
    { player_name: "Billy White", team_title: "Leeds" },
  ];
  assert.equal(matchExpectedMetricsRow({
    player: { name: "Bobby White", team_name: "Hull" }, source: ambiguous,
  }), null, "ambiguous initial-plus-surname evidence must be rejected");
});

test("conservative no-history rates are data-derived, positive and never above the ordinary prior", () => {
  const out = deriveConservativeNoHistoryRates(historyProfiles(), leagueRates, 10);
  for (const field of ["npxg90", "xa90"]) {
    for (const position of ["DEF", "MID", "FWD"]) {
      assert.ok(out[field][position] > 0, `${field} ${position} became zero`);
      assert.ok(out[field][position] <= leagueRates[field][position], `${field} ${position} became more aggressive`);
    }
  }
  assert.equal(out.npxg90.MID, 0.10, "the established-player median should be used");
  assert.equal(out.xa90.FWD, 0.05);
});

test("a promoted no-history player starts conservatively and reaches the normal prior by GW10", () => {
  const team = { promoted: true, players: [player(1, "MID"), player(2, "FWD")] };
  const gw1 = allocateTeam({ team, lambda: 1.2, priors: {}, cfg: cfg(), gw: 1, promotedPrior: null });
  const gw5 = allocateTeam({ team, lambda: 1.2, priors: {}, cfg: cfg(), gw: 5, promotedPrior: null });
  const gw10 = allocateTeam({ team, lambda: 1.2, priors: {}, cfg: cfg(), gw: 10, promotedPrior: null });
  const at = (out, id) => out.players.find((p) => p.player_id === id);

  assert.ok(at(gw1, 1).used_npxg90 < at(gw5, 1).used_npxg90);
  assert.ok(at(gw5, 1).used_npxg90 < at(gw10, 1).used_npxg90);
  assert.equal(at(gw10, 1).used_npxg90, leagueRates.npxg90.MID);
  assert.equal(at(gw1, 1).prior_blend, 1);
  assert.equal(at(gw10, 1).prior_blend, 0);
  assert.match(at(gw1, 1).rate_source, /promoted-conservative/);
  assert.doesNotMatch(at(gw10, 1).rate_source, /promoted-conservative/);
});

test("real Premier League evidence reduces the promoted prior instead of being erased", () => {
  const noHistory = promotedRateBlendWeight({ gw: 1, decayToGw: 10, nineties: 0, shrinkNineties: 20 });
  const established = promotedRateBlendWeight({ gw: 1, decayToGw: 10, nineties: 100, shrinkNineties: 20 });
  assert.equal(noHistory, 1);
  assert.ok(established < 0.17 && established > 0, established);

  const c = cfg();
  const own = player(1, "FWD", 100, "archive-expected");
  own.npxg90 = 0.70;
  own.xa90 = 0.15;
  const out = allocateTeam({ team: { promoted: true, players: [own, player(2, "MID")] }, lambda: 1.2, priors: {}, cfg: c, gw: 1, promotedPrior: null });
  const establishedPlayer = out.players.find((p) => p.player_id === 1);
  assert.ok(establishedPlayer.used_npxg90 > 0.60, "a full-season elite rate was flattened too far");
});

test("established clubs keep the ordinary no-history prior", () => {
  const c = cfg();
  const out = allocateTeam({
    team: { promoted: false, players: [player(1, "MID"), player(2, "FWD")] },
    lambda: 1.2, priors: {}, cfg: c, gw: 1, promotedPrior: null,
  });
  const mid = out.players.find((p) => p.player_id === 1);
  assert.equal(mid.used_npxg90, leagueRates.npxg90.MID);
  assert.equal(mid.used_xa90, leagueRates.xa90.MID);
  assert.equal(mid.prior_blend, 0);
});

test("promoted correction preserves team allocation conservation and contains no named overrides", () => {
  const out = allocateTeam({
    team: { promoted: true, players: [player(1, "DEF"), player(2, "MID"), player(3, "FWD")] },
    lambda: 1.2, priors: {}, cfg: cfg(), gw: 1, promotedPrior: null,
  });
  assert.ok(Math.abs(out.players.reduce((sum, p) => sum + p.goalShare, 0) - 1) < 1e-12);
  assert.ok(Math.abs(out.players.reduce((sum, p) => sum + p.assistShare, 0) - 1) < 1e-12);

  const source = [
    readFileSync(new URL("../lib/engine/player_data_matcher.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../lib/engine/layer2_allocation.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /Belloumi|Watkins|Arsenal|Lavia|Gomes/i);
});

test("production wiring derives conservative priors, uses matched profile minutes and stores player-level blend", () => {
  const job = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(job, /deriveConservativeNoHistoryRates/);
  assert.match(job, /for \(const profile of profiles\)/, "promoted detection must use resolved history profiles");
  assert.match(job, /prior_blend: Number\.isFinite\(Number\(pl\.prior_blend\)\)/,
    "the stored low-sample weight must be player-specific");
  assert.doesNotMatch(job, /const a = prior\.get\(p\.id\);[\s\S]{0,160}priorMinutesByTeam/,
    "raw id-only history must not decide whether a club is promoted");
});
