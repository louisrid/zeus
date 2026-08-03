import { resolveLineups } from "./lineups.mjs";

const finiteId = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/*
 * One authoritative gate between the published predicted line-ups and every xPTS surface.
 * The same resolved starter ids are consumed by the browser model, the server brief and the
 * structured Letta endpoints, so the website and the agent cannot disagree.
 */
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
    startingIds: active ? startingIds : new Set(),
    report: {
      source: "config/lineups.json",
      snapshot_gameweek: 1,
      applies_to_gameweeks: "GW1-GW8 until a newer predicted-line-up snapshot is supplied",
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
