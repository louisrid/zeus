/* Shared product routes.
 *
 * Dashboard cards, sidebar navigation and page titles all read from this registry so a route cannot
 * be renamed or removed in one surface while remaining stale in another.
 */
export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: "dashboard", label: "Dashboard", href: "/" }),
  Object.freeze({ key: "builder", label: "Builder", href: "/builder" }),
  Object.freeze({ key: "squad", label: "Squad", href: "/squad" }),
  /* Transfers is its own destination rather than a panel on the Squad page. A transfer is a decision
     about the next fifteen, not a description of the current one, and it needs the room to show all
     fifteen properly and three answers underneath them.
     shortLabel is for the phone tab bar only, where six destinations share the width of one thumb reach.
     The desktop rail and every page title still use label. */
  /* "Moves" existed because seven destinations shared one thumb reach and Transfers would not fit. News
     has gone, so there are six, and the word that names the page can be the word on the tab. */
  Object.freeze({ key: "transfers", label: "Transfers", href: "/transfers" }),
  Object.freeze({ key: "players", label: "Players", href: "/players" }),
  Object.freeze({ key: "lineups", label: "Line-ups", href: "/lineups" }),
]);

export const DASHBOARD_TILE_KEYS = Object.freeze(["builder", "squad", "players", "lineups"]);

const ROUTES_BY_KEY = new Map(PRIMARY_ROUTES.map((route) => [route.key, route]));

export function routeForKey(key) {
  return ROUTES_BY_KEY.get(key) || null;
}

export function routeTitleMap(extra = {}) {
  return Object.freeze({
    ...Object.fromEntries(PRIMARY_ROUTES.map((route) => [route.href, route.label])),
    ...extra,
  });
}
