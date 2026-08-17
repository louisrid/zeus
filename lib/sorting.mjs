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
  /* Defensive contribution. DEFCON is the rate, per ninety minutes, at which a player produces the
     actions FPL counts toward its two-point defensive bonus. DEFCON+ is that rate minus the threshold
     for his position, so it reads directly as how far clear of the line he is: positive means he
     typically earns it, negative means he typically does not. Raw totals are useless across positions
     because a defender needs ten and a midfielder twelve, which is exactly what DEFCON+ absorbs. */
  { key: "DEFCON", label: "DEFCON /90" },
  { key: "DEFCON_PLUS", label: "DEFCON +/-" },
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
  DEFCON: "108px", DEFCON_PLUS: "108px",
};

export const METRIC_COLOURS = Object.freeze({
  PRICE: "#FFFFFF",
  XPTS: "#4FD8FF",
  VALUE: "#00FF85",
  XPRICE: "#FFD166",
  FORM: "#C77DFF",
  PTS_LAST_YEAR: "#FF9F43",
  GAMETIME: "#04F5FF",
  OWNERSHIP: "#FF66C4",
  DEFCON: "#04F5FF",
  DEFCON_PLUS: "#00FF85",
});

export const metricColor = (key) => METRIC_COLOURS[key] || "#FFFFFF";

export function formatMetric(key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (key === "PRICE" || key === "XPRICE") return number.toFixed(1);
  if (key === "VALUE") return number.toFixed(2);
  if (key === "GAMETIME" || key === "OWNERSHIP") return `${Math.round(number)}%`;
  if (key === "PTS_LAST_YEAR") return String(Math.round(number));
  // DEFCON+ is a signed distance from the threshold, so the sign is the whole point of the number.
  if (key === "DEFCON_PLUS") return `${number > 0 ? "+" : ""}${number.toFixed(1)}`;
  if (key === "DEFCON") return number.toFixed(1);
  return number.toFixed(1);
}
