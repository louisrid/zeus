/* WHICH PROJECTIONS THE SITE SERVES.
 *
 * Two sets are imported side by side, in the same shape:
 *   blend    the mean of Sideline Quant, FPL GO and FPL Copilot (config/blend-xpts-2026-27.mjs)
 *   copilot  FPL Copilot on its own, the original source (config/external-xpts-2026-27.mjs)
 * The choice is a cookie, so it holds across every page and every server route for this browser, and is
 * set from the Projections switch on the Dashboard. No cookie means the default. */
export const XPTS_SOURCES = Object.freeze([
  Object.freeze({ key: "blend", label: "Mean of 3", detail: "Sideline Quant, FPL GO and FPL Copilot, averaged per gameweek" }),
  Object.freeze({ key: "copilot", label: "FPL Copilot", detail: "FPL Copilot on its own" }),
]);
export const DEFAULT_XPTS_SOURCE = "blend";
/* Renamed once (v2) so any choice saved before the mean became the default is dropped: every browser
   starts on the mean at its next load, and a choice made after that is kept. */
export const XPTS_SOURCE_COOKIE = "zeus_xpts_source_v2";

export const validXptsSource = (value) => (XPTS_SOURCES.some((s) => s.key === value) ? value : DEFAULT_XPTS_SOURCE);

/* Browser side: read the cookie. Server side callers pass the cookie value in. */
export function clientXptsSource() {
  if (typeof document === "undefined") return DEFAULT_XPTS_SOURCE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${XPTS_SOURCE_COOKIE}=([^;]+)`));
  return validXptsSource(match ? decodeURIComponent(match[1]) : null);
}

/* The cookie is written by /api/xpts-source, never by page script. */
export async function setClientXptsSource(key) {
  const value = validXptsSource(key);
  const res = await fetch("/api/xpts-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: value }) });
  if (!res.ok) throw new Error(`Could not save the projections choice (${res.status}).`);
  return value;
}
