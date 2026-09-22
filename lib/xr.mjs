/* xR IN ONE PLACE.
 *
 *   xR = xPTS × (1 − XR_B × ownership / 100)
 *
 * The solver has its own copy of these two constants because it must not import client code; this file
 * is what every screen and the /api/xpts endpoint use, so the figure on a card, in a table and in the API
 * is the same figure. Change b here and in the solver together, or the two will disagree.
 */
/* THE SWITCH FOR THE WHOLE FEATURE.
 *
 * False hides every xR surface: the toggles, the sort option, the column, the badge, the pills, the
 * per-week figures, the second net. The solver pass, the API fields and the storage stay exactly as
 * built, so flipping this to true brings the feature back whole. Off because, tested, xR never beat
 * leaving it off, and a control that costs points with no measured gain should not be on a screen by
 * default. */
export const XR_ENABLED = false;

export const XR_B = 0.5;

export function xrKeep(ownershipPercent, fallbackPercent = 0) {
  const share = Number.isFinite(Number(ownershipPercent)) && ownershipPercent !== null && ownershipPercent !== undefined
    ? Number(ownershipPercent) : fallbackPercent;
  return 1 - XR_B * Math.min(100, Math.max(0, share)) / 100;
}

export function xrOf(xpts, ownershipPercent, fallbackPercent = 0) {
  if (xpts === null || xpts === undefined || !Number.isFinite(Number(xpts))) return null;
  return Number(xpts) * xrKeep(ownershipPercent, fallbackPercent);
}
