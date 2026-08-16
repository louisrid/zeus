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
  { key: "GAMETIME", label: "GAMETIME %" },
  { key: "OWNERSHIP", label: "OWNERSHIP %" },
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
  PTS_LAST_YEAR: "128px", GAMETIME: "112px", OWNERSHIP: "116px",
};

/* THREE HUES, NOT SEVEN.
 *
 * Every column used to own a colour, which meant colour identified the column and nothing else. The
 * header already does that job, so seven hues bought no information and cost the whole table its
 * hierarchy: when every number is coloured, no number is emphasised.
 *
 * Colour is now reserved for the three metrics a squad decision actually turns on. Everything else is
 * white, which is not an absence of colour but the resting state that makes the three mean something.
 *
 *   XPTS       the projection the product exists to produce
 *   VALUE      points per million, the efficiency read
 *   OWNERSHIP  the crowd, the only column that is about other managers rather than the player
 *
 * Price, x£, Form, Pts LAST YEAR and Gametime are reference figures. They are read when you go looking
 * for them, not scanned, so they stay white. */
export const METRIC_COLOURS = Object.freeze({
  PRICE: "#FFFFFF",
  XPTS: "#4FD8FF",
  VALUE: "#00FF85",
  XPRICE: "#FFFFFF",
  FORM: "#FFFFFF",
  PTS_LAST_YEAR: "#FFFFFF",
  GAMETIME: "#FFFFFF",
  OWNERSHIP: "#FF66C4",
});

export const metricColor = (key) => METRIC_COLOURS[key] || "#FFFFFF";

export function formatMetric(key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (key === "PRICE" || key === "XPRICE") return number.toFixed(1);
  if (key === "VALUE") return number.toFixed(2);
  if (key === "GAMETIME" || key === "OWNERSHIP") return `${Math.round(number)}%`;
  if (key === "PTS_LAST_YEAR") return String(Math.round(number));
  return number.toFixed(1);
}
