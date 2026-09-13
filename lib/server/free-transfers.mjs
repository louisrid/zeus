/* HOW MANY FREE TRANSFERS ARE ACTUALLY IN HAND.
 *
 * The app worked this out by simulating from gameweek one: assume one a week, assume none were used,
 * assume nothing was banked away. The moment reality differed the figure drifted, and it drifted
 * silently, because nothing on the live team ever showed it at all. It said two when the answer was one,
 * which makes every hit calculation after it wrong by four points a move.
 *
 * The entry's own history has the facts: how many transfers were made in each gameweek, what they cost,
 * and which chips were played. This counts from those instead of guessing.
 *
 * THE RULES, as the game applies them:
 *
 *   Before the first deadline the squad is built for free, so nothing banks out of gameweek one.
 *   One free transfer is granted each gameweek after that.
 *   Unused ones bank, up to five.
 *   A wildcard or free hit gives unlimited transfers that week and does not consume the banked ones.
 *
 * It is deliberately not clever about the future: it answers for the gameweek after the last one played,
 * which is the only week anyone is deciding about.
 */

const FIRST_HALF_ENDS_AFTER = 19;
const MAX_BANKED = 5;
const FREE_PER_GW = 1;
const UNLIMITED_CHIPS = new Set(["wildcard", "freehit"]);

/* `history` is the `current` array from /entry/{id}/history/, `chips` is its `chips` array. */
export function freeTransfersFrom(history, chips) {
  const weeks = (Array.isArray(history) ? history : [])
    .map((row) => ({
      gw: Number(row.event),
      made: Number(row.event_transfers) || 0,
    }))
    .filter((row) => Number.isInteger(row.gw))
    .sort((a, b) => a.gw - b.gw);

  if (!weeks.length) return { gw: 1, free: FREE_PER_GW, played: [] };

  const chipByGw = new Map();
  for (const chip of Array.isArray(chips) ? chips : []) {
    const gw = Number(chip?.event);
    const name = String(chip?.name || "").toLowerCase();
    if (Number.isInteger(gw)) chipByGw.set(gw, name);
  }

  let free = FREE_PER_GW;
  for (const week of weeks) {
    const chip = chipByGw.get(week.gw);
    const unlimited = chip ? UNLIMITED_CHIPS.has(chip) : false;

    if (week.gw === 1) {
      /* Nothing banks out of gameweek one: the squad was built for free, so the transfer that week was
         never spent and was never saved either. */
      free = FREE_PER_GW;
      continue;
    }

    /* A wildcard or free hit does not eat the bank. Everything else does, and a manager who took a hit
       used more than he had, which floors the carry at zero rather than going negative. */
    const carried = unlimited ? free : Math.max(0, free - week.made);
    free = Math.min(MAX_BANKED, carried + FREE_PER_GW);
  }

  const lastPlayed = weeks[weeks.length - 1].gw;
  return {
    /* The count is for the week being planned, which is the one after the last played. */
    gw: lastPlayed + 1,
    free,
    played: weeks.map((week) => ({ gw: week.gw, transfers: week.made, chip: chipByGw.get(week.gw) || null })),
  };
}
