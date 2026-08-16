import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLineups } from "../lib/lineups.mjs";
import { resolveMinutes, lineupRolesOf } from "../lib/minutes_resolved.mjs";
import { normaliseTeamStarts } from "../lib/engine/layer3_minutes.mjs";

const LINEUPS = JSON.parse(readFileSync("config/lineups.json", "utf8"));
const SNAP = JSON.parse(readFileSync("tests/fpl-players.json", "utf8"));
const cfg = { pStartCeiling: 0.98, earlySubShare: 0.1712, teamMinuteTarget: 990 };

function baseMinutes(player) {
  const seed = Number(player.fpl_id || 0) % 7;
  return {
    position: player.position,
    p_start: 0.15 + seed * 0.08,
    p_cameo: player.position === "GKP" ? 0 : 0.12 + (seed % 4) * 0.07,
    p60_given_start: 0.78 + (seed % 3) * 0.06,
    p60: 0.5,
    exp_min_start: Math.min(90, 76 + seed * 2),
    exp_min_cameo: 14 + (seed % 5) * 2,
  };
}

test("all current GW1 lineups produce coherent team minutes and goalkeeper selection", () => {
  const resolution = resolveLineups(LINEUPS.clubs, SNAP.players, SNAP.teams);
  const profiles = SNAP.players.map((player) => ({
    ...player,
    team_id: resolution.teamOverrideByFplId.get(player.fpl_id) ?? player.team_id,
  }));
  const roles = lineupRolesOf(resolution, profiles);
  const byTeam = new Map();

  for (const player of profiles) {
    const minutes = resolveMinutes({
      base: baseMinutes(player),
      lineup: roles.get(player.fpl_id) || null,
      status: "a",
      earlySubShare: cfg.earlySubShare,
      confidence: LINEUPS.confidence,
      official: LINEUPS.official,
    });
    const row = { ...player, ...minutes };
    if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, []);
    byTeam.get(row.team_id).push(row);
  }

  for (const team of SNAP.teams) {
    const squad = byTeam.get(team.id) || [];
    assert.ok(squad.length >= 11, `${team.short_name} has only ${squad.length} players after overrides`);
    normaliseTeamStarts(squad, cfg);
    const startTotal = squad.reduce((sum, p) => sum + p.p_start, 0);
    const gkTotal = squad.filter((p) => p.position === "GKP").reduce((sum, p) => sum + p.p_start, 0);
    const minsTotal = squad.reduce((sum, p) => sum + p.p_start * p.exp_min_start + p.p_cameo * p.exp_min_cameo, 0);
    assert.ok(Math.abs(startTotal - 11) < 1e-8, `${team.short_name} start total ${startTotal}`);
    assert.ok(Math.abs(gkTotal - 1) < 1e-8, `${team.short_name} goalkeeper total ${gkTotal}`);
    assert.ok(Math.abs(minsTotal - 990) < 1e-6, `${team.short_name} minute total ${minsTotal}`);
  }

  /* Every player named in a published eleven must come out as a locked starter. This used to be a short
     hand-written list, which went stale the moment the source republished and left Saka asserted as an
     Arsenal starter after he had dropped out of the eleven. Deriving the expectation from the same file
     the code reads means a transcription change can never silently disagree with the test. */
  let checkedStarters = 0;
  for (const row of LINEUPS.clubs) {
    const team = SNAP.teams.find((t) => t.short_name === row.short);
    assert.ok(team, `${row.short} must resolve to a team`);
    for (const [name, fplId] of Object.entries(row.ids || {})) {
      const resolved = (byTeam.get(team.id) || []).find((r) => r.fpl_id === fplId);
      assert.ok(resolved, `${name} (${row.short}) missing from the resolved squad`);
      assert.equal(resolved.p_start, 1, `${name} is published for ${row.short} and must start`);
      checkedStarters += 1;
    }
  }
  assert.equal(checkedStarters, 220, "twenty published elevens, all locked");

  const valid = [...resolution.byClub.values()].filter((x) => x.valid).length;
  assert.equal(valid, 20, "every published eleven resolves cleanly");
  assert.equal(resolution.teamOverrideByFplId.size, 0,
    "a current player list needs no club overrides");
});
