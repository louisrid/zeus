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

test("unofficial lineups are still normalised to one goalkeeper and ten outfield starters", () => {
  const players = [
    { position: "GKP", p_start: 0.8, p_cameo: 0, p60_given_start: 0.9, minutes_source: "lineup-starter" },
    { position: "GKP", p_start: 0.6, p_cameo: 0, p60_given_start: 0.9, minutes_source: "lineup-starter" },
    ...Array.from({ length: 18 }, (_, index) => ({
      position: index < 7 ? "DEF" : index < 14 ? "MID" : "FWD",
      p_start: index < 10 ? 0.8 : 0.25,
      p_cameo: 0.2,
      p60_given_start: 0.85,
      minutes_source: index < 10 ? "lineup-starter" : "lineup-notNamed",
    })),
  ];
  normaliseTeamStarts(players, cfg);
  const gkTotal = players.filter((p) => p.position === "GKP").reduce((s, p) => s + p.p_start, 0);
  const outfieldTotal = players.filter((p) => p.position !== "GKP").reduce((s, p) => s + p.p_start, 0);
  assert.ok(Math.abs(gkTotal - 1) < 1e-9);
  assert.ok(Math.abs(outfieldTotal - 10) < 1e-9);
  assert.ok(Math.abs(gkTotal + outfieldTotal - 11) < 1e-9);
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
