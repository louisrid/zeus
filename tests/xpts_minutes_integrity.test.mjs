import test from "node:test";
import assert from "node:assert/strict";
import { forecastMinutes, normaliseTeamStarts, sampleXI } from "../lib/engine/layer3_minutes.mjs";
import { resolveMinutes } from "../lib/minutes_resolved.mjs";

const cfg = {
  kStart: 1,
  kSurvive: 1,
  wMinutesShare: 0.95,
  pStartCeiling: 1,
  newcomerStartRate: 0.18,
  earlySubShare: 0.17,
  wcPrior: null,
};

const league = {
  startRate: 0.5,
  appearRate: 0.75,
  survive60: 0.85,
  expMinStart: 78,
  expMinCameo: 18,
};

test("goalkeepers never inherit the generic outfield cameo probability", () => {
  const base = forecastMinutes({
    player: {
      position: "GKP", status: "a", chance_of_playing: null,
      starts: 5, appearances: 8, starts60: 5,
      minutes: 450, teamMinutesAvailable: 3420, teamGames: 38,
      startMinutes: 450, cameos: 3, cameoMinutes: 30,
    },
    league, signal: null, gw: 1, cfg,
  });
  assert.equal(base.p_cameo, 0);
  const resolved = resolveMinutes({
    base,
    lineup: "notNamed",
    status: "a",
    confidence: 0.75,
    official: false,
    earlySubShare: cfg.earlySubShare,
  });
  assert.equal(resolved.p_cameo, 0);
});

test("a validated XI stays locked and its expected minutes fit inside one match", () => {
  const positions = ["GKP", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD",
    "GKP", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
  const players = positions.map((position, index) => ({
    position,
    p_start: index < 11 ? 1 : 0,
    p_cameo: index < 11 ? 0 : 0.25 + (index % 3) * 0.05,
    p60_given_start: 0.85,
    exp_min_start: index < 11 ? 80 + (index % 4) * 2 : 76,
    exp_min_cameo: 16 + (index % 4),
    minutes_source: index < 11 ? "lineup-starter" : "lineup-notNamed",
  }));
  normaliseTeamStarts(players, cfg);
  const gkTotal = players.filter((p) => p.position === "GKP").reduce((s, p) => s + p.p_start, 0);
  const outfieldTotal = players.filter((p) => p.position !== "GKP").reduce((s, p) => s + p.p_start, 0);
  const expectedMinutes = players.reduce((s, p) => s + p.p_start * p.exp_min_start + p.p_cameo * p.exp_min_cameo, 0);
  assert.ok(Math.abs(gkTotal - 1) < 1e-9);
  assert.ok(Math.abs(outfieldTotal - 10) < 1e-9);
  assert.ok(Math.abs(expectedMinutes - 990) < 1e-6, expectedMinutes);
  for (const p of players.slice(0, 11)) assert.equal(p.p_start, 1);
  for (const p of players.slice(11)) assert.equal(p.p_start, 0);
});

test("an impossible locked XI with two goalkeepers is rejected", () => {
  const players = [
    { position: "GKP", p_start: 1, minutes_source: "lineup-starter" },
    { position: "GKP", p_start: 1, minutes_source: "lineup-starter" },
    ...Array.from({ length: 10 }, () => ({ position: "DEF", p_start: 1, minutes_source: "lineup-starter" })),
  ];
  assert.throws(() => normaliseTeamStarts(players, cfg), /Invalid locked XI/);
});

test("unavailable players remain exactly zero after team normalisation", () => {
  const players = [
    { position: "GKP", p_start: 0.9, p_cameo: 0, p60_given_start: 0.9, minutes_source: "forecast" },
    { position: "GKP", p_start: 0.1, p_cameo: 0, p60_given_start: 0.9, minutes_source: "forecast" },
    ...Array.from({ length: 18 }, (_, index) => ({
      position: index < 7 ? "DEF" : index < 14 ? "MID" : "FWD",
      p_start: 0.55,
      p_cameo: 0.2,
      p60_given_start: 0.85,
      minutes_source: "forecast",
    })),
    { position: "DEF", p_start: 0, p_cameo: 0, p60: 0, p60_given_start: 0.8, minutes_source: "unavailable" },
  ];
  normaliseTeamStarts(players, cfg);
  const unavailable = players.at(-1);
  assert.equal(unavailable.p_start, 0);
  assert.equal(unavailable.p_cameo, 0);
  assert.equal(unavailable.p60, 0);
});

test("XI sampling rejects an incomplete available player pool instead of selecting unavailable players", () => {
  const players = [
    ...Array.from({ length: 10 }, (_, id) => ({ id, p_start: 0.5, minutes_source: "forecast" })),
    { id: 99, p_start: 0, minutes_source: "unavailable" },
  ];
  assert.throws(
    () => sampleXI(players, () => 0.5),
    /only 10 available players have positive start probability/
  );
});

test("an unavailable named outfield starter opens one replacement slot instead of crashing", () => {
  const players = [
    { position: "GKP", p_start: 1, p_cameo: 0, p60_given_start: 0.9, exp_min_start: 90, exp_min_cameo: 0, minutes_source: "lineup-starter" },
    ...Array.from({ length: 9 }, (_, index) => ({
      position: index < 4 ? "DEF" : index < 8 ? "MID" : "FWD",
      p_start: 1, p_cameo: 0, p60_given_start: 0.85,
      exp_min_start: 80, exp_min_cameo: 18, minutes_source: "lineup-starter",
    })),
    { position: "FWD", p_start: 0, p_cameo: 0, p60_given_start: 0.85, exp_min_start: 80, exp_min_cameo: 18, minutes_source: "unavailable" },
    { position: "DEF", p_start: 0, pre_lineup_p_start: 0.55, p_cameo: 0.25, p60_given_start: 0.8, exp_min_start: 76, exp_min_cameo: 18, minutes_source: "lineup-notNamed" },
    { position: "MID", p_start: 0, pre_lineup_p_start: 0.30, p_cameo: 0.35, p60_given_start: 0.8, exp_min_start: 74, exp_min_cameo: 20, minutes_source: "lineup-notNamed" },
    { position: "FWD", p_start: 0, pre_lineup_p_start: 0.15, p_cameo: 0.40, p60_given_start: 0.75, exp_min_start: 72, exp_min_cameo: 19, minutes_source: "lineup-notNamed" },
  ];

  normaliseTeamStarts(players, cfg);

  const availableStartTotal = players.reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  const replacementStartTotal = players.slice(-3).reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  assert.ok(Math.abs(availableStartTotal - 11) < 1e-9, availableStartTotal);
  assert.ok(Math.abs(replacementStartTotal - 1) < 1e-9, replacementStartTotal);
  assert.equal(players[10].p_start, 0, "the unavailable named starter remains zero");
  assert.ok(players[11].p_start > players[12].p_start && players[12].p_start > players[13].p_start,
    "replacement probabilities follow the pre-lineup forecast weights");
});

test("an unavailable named goalkeeper promotes a backup goalkeeper instead of crashing", () => {
  const players = [
    { position: "GKP", p_start: 0, p_cameo: 0, p60_given_start: 0.9, exp_min_start: 90, exp_min_cameo: 0, minutes_source: "unavailable" },
    ...Array.from({ length: 10 }, (_, index) => ({
      position: index < 4 ? "DEF" : index < 8 ? "MID" : "FWD",
      p_start: 1, p_cameo: 0, p60_given_start: 0.85,
      exp_min_start: 80, exp_min_cameo: 18, minutes_source: "lineup-starter",
    })),
    { position: "GKP", p_start: 0, pre_lineup_p_start: 0.35, p_cameo: 0, p60_given_start: 0.9, exp_min_start: 90, exp_min_cameo: 0, minutes_source: "lineup-notNamed" },
    { position: "GKP", p_start: 0, pre_lineup_p_start: 0.05, p_cameo: 0, p60_given_start: 0.9, exp_min_start: 90, exp_min_cameo: 0, minutes_source: "lineup-notNamed" },
  ];

  normaliseTeamStarts(players, cfg);

  const gkTotal = players.filter((p) => p.position === "GKP").reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  assert.ok(Math.abs(gkTotal - 1) < 1e-9, gkTotal);
  assert.equal(players[0].p_start, 0);
  assert.ok(players[11].p_start > players[12].p_start, "the likelier backup receives the larger share");
});
