/* SORTING FOR THE PLAYER TABLES.
 *
 * Pure logic, in a plain module so it can be tested directly. One list, used to build both the SORT BY
 * dropdown and the sortable table columns, so the two cannot drift apart or disagree about direction.
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

/* Highest first, then lowest first, then back to the default view. The same function serves a dropdown
   change and a column click, which is what keeps them in step. */
export function cycleSort(current, key) {
  if (current.key !== key) return { key, dir: "desc" };
  if (current.dir === "desc") return { key, dir: "asc" };
  return { ...DEFAULT_SORT };
}

export const sortArrow = (sort, key) => (sort.key !== key ? "" : sort.dir === "desc" ? " ↓" : " ↑");

/* Column widths sized to their labels, since two headings overflowed when the wording got longer. */
export const COL_WIDTH = {
  PRICE: "92px", XPTS: "92px", VALUE: "92px", XPRICE: "92px", FORM: "92px",
  PTS_LAST_YEAR: "128px", GAMETIME: "112px", OWNERSHIP: "116px",
};
