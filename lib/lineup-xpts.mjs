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
/* NOT IN THE ELEVEN MEANS ZERO, FOR EVERY GAMEWEEK SERVED.
 *
 * The rule is the one Louis has stated repeatedly and it is not complicated: if a player is not in his
 * club's predicted line-up he is worth nothing, and when the line-ups refresh and he is back in, he is
 * worth something again. The line-ups are pulled every day, so the snapshot is never more than a day old
 * and the answer moves with it.
 *
 * I narrowed this twice to the snapshot's own gameweek, on the reasoning that one team sheet cannot speak
 * for a whole season. That reasoning is defensible and it is not what was asked for, and the effect on
 * screen was worse than the thing it avoided: a player left out of every published eleven still showed a
 * full projection from the following week onward, so a squad built across a range quietly counted points
 * for players nobody expects to play. A rule that applies to one week out of eight is not a rule anyone
 * can reason about.
 *
 * So the gate covers everything that is served. The raw imported value is kept for audit either way, and
 * the daily pull is what keeps it honest. */
const SERVED_TO = Math.min(38, Number(EXTERNAL_XPTS_DATA.gw_served_to) || Number(EXTERNAL_XPTS_DATA.gw_to) || 8);
export const LINEUP_GATE_APPLIES_FROM = 1;
export const LINEUP_GATE_APPLIES_TO = SERVED_TO;

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
