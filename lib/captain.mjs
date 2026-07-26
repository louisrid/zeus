/* CAPTAIN DOUBLING, at display time only.
 *
 * A captained player's xP is doubled in the squad total, but the figure shown next to his name was the
 * undoubled one, so the row contradicted the total. Nothing is ever stored doubled: the armband is the
 * single source of truth, so removing it restores the plain figure everywhere with no cleanup.
 */
export function xpWithCaptain(value, isCaptain) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { value: null, doubled: false };
  }
  return { value: isCaptain ? Number(value) * 2 : Number(value), doubled: Boolean(isCaptain) };
}
