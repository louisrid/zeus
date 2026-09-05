import { resolveLineups } from "./lineups.mjs";
/* Read from the config, not from lib/external_xpts.mjs: that module imports this one, so importing
   it back would be a cycle and the constant would be read before it is initialised. */
import EXTERNAL_XPTS_DATA from "../config/external-xpts-2026-27.mjs";
/* Read for the gameweek it was captured for, nothing else. */
import LINEUPS_SNAPSHOT from "../config/lineups.json" with { type: "json" };

const finiteId = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/*
 * One authoritative gate between the published predicted line-ups and every xPTS surface.
 * The same resolved starter ids are consumed by the browser model, the server brief and the
 * structured Letta endpoints, so the website and the agent cannot disagree.
 */
/* The published snapshot is a single gameweek's team news, but it is treated as the best available
 * evidence for a window of gameweeks rather than for one week alone. That window is deliberately finite.
 * Team news nine weeks out is not evidence of anything, so beyond APPLIES_TO the gate stops applying and
 * imported xPTS is returned ungated rather than being zeroed on the strength of a stale graphic. */
/* THE GATE COVERS THE GAMEWEEK THE TEAM NEWS IS ABOUT, AND NO OTHER.
 *
 * This was tied to the served horizon, which was defensible while that horizon was eight weeks and
 * became indefensible the moment it became the whole season. config/lineups.json is one gameweek's
 * predicted elevens: twenty clubs, eleven names each, about two hundred and twenty players. Spanning it
 * across all thirty-eight gameweeks therefore zeroed every one of the four hundred and thirty-odd
 * players not named in it, for the entire season, on the strength of a single team sheet. Whole clubs'
 * squads vanished from the projections and no message anywhere said why.
 *
 * A published eleven is evidence about the match it was published for. So the gate applies to the
 * snapshot's own gameweek, and a week with no published eleven is not gated at all, because there is
 * nothing to gate it with. Refresh the line-ups and the window moves with them, which is exactly the
 * behaviour asked for: left out of the eleven means zero, and back in the eleven means points again. */
const SNAPSHOT_GAMEWEEK = Number(LINEUPS_SNAPSHOT?.gameweek) || 1;
const SERVED_TO = Math.min(38, Number(EXTERNAL_XPTS_DATA.gw_served_to) || Number(EXTERNAL_XPTS_DATA.gw_to) || 8);
export const LINEUP_GATE_APPLIES_FROM = Math.min(SNAPSHOT_GAMEWEEK, SERVED_TO);
export const LINEUP_GATE_APPLIES_TO = LINEUP_GATE_APPLIES_FROM;

export function lineupGateCoversGameweek(gate, gw) {
  if (!gate?.active) return false;
  const week = Number(gw);
  if (!Number.isFinite(week)) return false;
  const from = Number.isFinite(Number(gate.appliesFrom)) ? Number(gate.appliesFrom) : LINEUP_GATE_APPLIES_FROM;
  const to = Number.isFinite(Number(gate.appliesTo)) ? Number(gate.appliesTo) : LINEUP_GATE_APPLIES_TO;
  return week >= from && week <= to;
}

export function buildLineupGate({ clubs = [], players = [], teams = [] } = {}) {
  const resolution = resolveLineups(clubs, players, teams);
  const startingIds = new Set(
    [...(resolution.startingIds || [])]
      .map(finiteId)
      .filter((value) => value !== null),
  );

  const clubRows = [...(resolution.byClub?.values?.() || [])].map(({ row, club, lines, valid, problems }) => ({
    club: row?.club ?? null,
    short: row?.short ?? null,
    team_id: finiteId(club?.id),
    slots: (lines || []).flat().length,
    matched: (lines || []).flat().filter((entry) => entry?.player).length,
    valid: Boolean(valid),
    problems: Array.isArray(problems) ? problems : [],
  }));

  const sourceSlots = clubRows.reduce((sum, row) => sum + row.slots, 0);
  const linkedClubs = clubRows.filter((row) => row.team_id !== null).length;
  const validClubs = clubRows.filter((row) => row.valid).length;
  const coverage = sourceSlots > 0 ? startingIds.size / sourceSlots : 0;
  /* A recent transfer can briefly leave the same player in two published club graphics. The resolver keeps
   * only the newest occurrence, so insisting on 220 unique ids would disable the entire league because one
   * older graphic is stale. The safe gate is the checked 20 x 11 source plus at least 90% unique resolution.
   * Every unresolved current player is still treated as not predicted and therefore receives zero. */
  const active = clubRows.length === 20 && linkedClubs === 20 && sourceSlots === 220 && coverage >= 0.9;

  return {
    active,
    appliesFrom: LINEUP_GATE_APPLIES_FROM,
    appliesTo: LINEUP_GATE_APPLIES_TO,
    startingIds: active ? startingIds : new Set(),
    report: {
      source: "config/lineups.json",
      snapshot_gameweek: 1,
      applies_from_gameweek: LINEUP_GATE_APPLIES_FROM,
      applies_to_gameweek: LINEUP_GATE_APPLIES_TO,
      applies_to_gameweeks: `GW${LINEUP_GATE_APPLIES_FROM}-GW${LINEUP_GATE_APPLIES_TO} until a newer predicted-line-up snapshot is supplied`,
      clubs: clubRows.length,
      linked_clubs: linkedClubs,
      source_slots: sourceSlots,
      valid_clubs: validClubs,
      predicted_starters: startingIds.size,
      resolution_coverage: coverage,
      unresolved_slots: Math.max(0, sourceSlots - startingIds.size),
      active,
      activation_rule: "20 linked clubs, 220 published slots and at least 90% unique player resolution",
      unmatched_names: Array.isArray(resolution.unmatched) ? resolution.unmatched : [],
      club_rows: clubRows,
    },
  };
}

export function isPredictedStarter(gate, player) {
  if (!gate?.active) return null;
  const id = finiteId(player?.fpl_id ?? player?.element ?? player?.id);
  return id === null ? false : gate.startingIds.has(id);
}
