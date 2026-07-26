/* ROLE REALLOCATION — DECISIONS 9.12.
 *
 * When a player is unavailable, his role does not vanish, it transfers. Zeroing him and leaving
 * everyone else untouched loses points that will certainly be scored by somebody.
 *
 * What this reallocates, and on what evidence:
 *   PENALTIES  duty is derived from missed penalties in the open dataset (jobs/penalty_duty.mjs),
 *              so the hierarchy is real. When the taker is out, his penalty share passes to the
 *              next taker at the same club by confidence.
 *   GOAL AND ASSIST SHARE  an absent player's share is redistributed to teammates in the same
 *              position group, in proportion to their existing share. That is the assumption with
 *              the least structure: it does not invent a tactical replacement, it says the chances
 *              still happen and the players who were already involved absorb them.
 *
 * What this deliberately does NOT do:
 *   Corners and free kicks. Neither leaves a trace in any ingested source, so there is no hierarchy
 *   to walk. Reallocating them would be invention.
 *   Guess at a manager's replacement choice. That is excluded permanently, see docs/model-exclusions.md.
 *
 * Everything here is pure: no database, no clock, so it is fully testable.
 */

export const AVAILABLE = (p) => {
  if (!p) return false;
  if (p.status && p.status !== "a") return false;
  if (p.chance_of_playing !== null && p.chance_of_playing !== undefined && Number(p.chance_of_playing) < 50) return false;
  return true;
};

/* Penalty share moves to the next available taker at the same club, ranked by confidence. */
export function reallocatePenalties(players, duties) {
  const byPlayer = new Map();
  for (const d of duties || []) {
    if (d.kind !== "penalty") continue;
    byPlayer.set(d.player_id, Number(d.confidence) || 0);
  }
  const takers = players
    .filter((p) => byPlayer.has(p.id))
    .sort((a, b) => byPlayer.get(b.id) - byPlayer.get(a.id));

  const byTeam = new Map();
  for (const t of takers) {
    const list = byTeam.get(t.team_id) || [];
    list.push(t);
    byTeam.set(t.team_id, list);
  }

  const out = new Map();
  for (const [teamId, list] of byTeam) {
    const first = list.find(AVAILABLE);
    for (const t of list) {
      out.set(t.id, {
        player_id: t.id,
        team_id: teamId,
        onPenalties: Boolean(first && first.id === t.id),
        confidence: byPlayer.get(t.id),
        promotedBecause: first && first.id === t.id && !AVAILABLE(list[0]) && list[0].id !== t.id
          ? `${list[0].web_name || list[0].id} unavailable`
          : null,
      });
    }
  }
  return out;
}

/* An absent player's goal and assist share is absorbed by available teammates in the same position
   group, in proportion to the share they already had. Shares are renormalised to sum to what they
   summed to before, so nothing is created or lost. */
export function reallocateShares(players, shareOf) {
  const groups = new Map();
  for (const p of players) {
    const key = `${p.team_id}|${p.position}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const out = new Map();
  for (const [, list] of groups) {
    const available = list.filter(AVAILABLE);
    const absent = list.filter((p) => !AVAILABLE(p));
    const freed = absent.reduce((a, p) => a + (Number(shareOf(p)) || 0), 0);
    const held = available.reduce((a, p) => a + (Number(shareOf(p)) || 0), 0);

    for (const p of absent) out.set(p.id, 0);

    if (!available.length) continue;
    for (const p of available) {
      const own = Number(shareOf(p)) || 0;
      // Proportional when the remaining players have any share at all, otherwise split evenly.
      const extra = held > 0 ? freed * (own / held) : freed / available.length;
      out.set(p.id, own + extra);
    }
  }
  return out;
}

/* One call: both reallocations, plus a note per player so the UI can say why a number moved. */
export function reallocate({ players, duties, shareOf }) {
  const penalties = reallocatePenalties(players, duties);
  const shares = reallocateShares(players, shareOf);
  const out = new Map();
  for (const p of players) {
    const pen = penalties.get(p.id) || null;
    out.set(p.id, {
      available: AVAILABLE(p),
      share: shares.has(p.id) ? shares.get(p.id) : Number(shareOf(p)) || 0,
      onPenalties: pen ? pen.onPenalties : false,
      penaltyConfidence: pen ? pen.confidence : null,
      note: pen && pen.promotedBecause ? `On penalties: ${pen.promotedBecause}` : null,
    });
  }
  return out;
}
