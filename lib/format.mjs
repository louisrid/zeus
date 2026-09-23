/* HOW NUMBERS ARE WRITTEN, IN ONE PLACE.
 *
 * toFixed(1) was scattered across forty places, each a chance for one screen to say 5.7 where another
 * said 5.67. Data keeps two decimals; screens show one. Money is one decimal with a pound sign.
 * Ownership is one decimal with a percent. Every screen imports these rather than deciding for itself. */

export const fmtPts = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(1));
export const fmtSigned = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
};
export const fmtMoney = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : `£${Number(value).toFixed(1)}m`);
export const fmtPct = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : `${Number(value).toFixed(1)}%`);
export const fmtCount = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : String(Math.round(Number(value))));
