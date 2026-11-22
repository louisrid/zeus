/* ROWS READ BEST FIRST, EVERYWHERE.
 *
 * Every pitch (Builder, Squad, the Dashboard, Line-ups) lays each row of the eleven out left to right by
 * the figure printed on the plates: the captain's doubled (or tripled) figure counts as shown, and with xR
 * on it is the xR figure. It is display only: nobody is moved in or out, the bench and the formation are
 * untouched and the stored plan is not rewritten, so a row can never read out of order, whatever order the
 * plan happens to hold. Players without a figure go last, in their existing order; ties keep it too. */
const figureOf = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

export function bestFirst(players = [], valueOf = () => null) {
  return players
    .map((player, index) => ({ player, index, value: figureOf(valueOf(player)) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return (b.value - a.value) || (a.index - b.index);
    })
    .map((entry) => entry.player);
}

/* The figure a plate prints: the raw projection, multiplied for the captain. */
export function shownFigure(raw, { captain = false, multiplier = 2 } = {}) {
  const value = figureOf(raw);
  if (value === null) return null;
  return captain ? value * (Number(multiplier) || 2) : value;
}
