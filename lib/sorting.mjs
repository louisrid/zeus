/* SORTING FOR THE PLAYER TABLES.
 *
 * One list drives dropdowns, headings, formatting and colours across every player surface.
 */

export const SORT_KEYS = [
  { key: "PRICE", label: "PRICE" },
  { key: "XPTS", label: "xPTS" },
  { key: "VALUE", label: "VALUE" },
  { key: "XPRICE", label: "x£" },
  { key: "FORM", label: "FORM" },
  { key: "PTS_LAST_YEAR", label: "PTS LAST YEAR" },
  /* What he has actually scored this season, as opposed to what is expected of him. Every other column
     here is a forecast or a rate; this is the only record of what happened, and it was missing. */
  { key: "PTS_THIS_YEAR", label: "PTS THIS YEAR" },
  { key: "GAMETIME", label: "GAMETIME %" },
  { key: "OWNERSHIP", label: "OWNERSHIP %" },
  /* Defensive contribution, in one column rather than two.
     The number is the rate at which a player produces the actions FPL counts toward its two-point
     defensive bonus, per ninety minutes. The colour is whether that rate clears the threshold for his
     position: green if it does, pink if it does not. Two columns said the same thing twice and pushed the
     table past the width of the screen, and a bare margin like "+1.5" is meaningless without the rate
     beside it. Rate plus colour carries both facts in one cell. The full breakdown, including which
     actions he actually makes, is on his own page. */
  { key: "DEFCON", label: "DEFCON /90" },
];

export const DEFAULT_SORT = { key: "PRICE", dir: "desc" };

export function cycleSort(current, key) {
  if (current.key !== key) return { key, dir: "desc" };
  if (current.dir === "desc") return { key, dir: "asc" };
  return { ...DEFAULT_SORT };
}

export const sortArrow = (sort, key) => (sort.key !== key ? "" : sort.dir === "desc" ? " ↓" : " ↑");

export const COL_WIDTH = {
  PRICE: "92px", XPTS: "92px", VALUE: "92px", XPRICE: "92px", FORM: "92px",
  /* Both points columns trimmed to fit the budget. A season total is three digits at most, so the extra
     width was padding, and the table clipping on a laptop costs more than the padding was worth. */
  PTS_LAST_YEAR: "76px", PTS_THIS_YEAR: "76px", GAMETIME: "88px", OWNERSHIP: "92px",
  DEFCON: "104px",
};

export const METRIC_COLOURS = Object.freeze({
  PRICE: "#FFFFFF",
  XPTS: "#4FD8FF",
  VALUE: "#00FF85",
  XPRICE: "#FFD166",
  FORM: "#C77DFF",
  PTS_LAST_YEAR: "#FF9F43",
  /* The same cyan the app uses for a fact rather than a forecast, so a real score never reads as an
     expectation at a glance. */
  PTS_THIS_YEAR: "#04F5FF",
  GAMETIME: "#04F5FF",
  OWNERSHIP: "#FF66C4",
  DEFCON: "#04F5FF",
});

export const metricColor = (key) => METRIC_COLOURS[key] || "#FFFFFF";

export function formatMetric(key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (key === "PRICE" || key === "XPRICE") return number.toFixed(1);
  if (key === "VALUE") return number.toFixed(2);
  if (key === "GAMETIME" || key === "OWNERSHIP") return `${Math.round(number)}%`;
  if (key === "PTS_LAST_YEAR" || key === "PTS_THIS_YEAR") return String(Math.round(number));
  if (key === "DEFCON") return number.toFixed(1);
  return number.toFixed(1);
}
