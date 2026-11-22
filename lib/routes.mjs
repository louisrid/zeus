/* Shared product routes.
 *
 * Dashboard cards, sidebar navigation and page titles all read from this registry so a route cannot
 * be renamed or removed in one surface while remaining stale in another.
 */
export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: "dashboard", label: "Dashboard", shortLabel: "Home", href: "/" }),
  Object.freeze({ key: "builder", label: "Builder", href: "/builder" }),
  Object.freeze({ key: "squad", label: "Squad", href: "/squad" }),
  /* Transfers is its own destination rather than a panel on the Squad page. A transfer is a decision
     about the next fifteen, not a description of the current one, and it needs the room to show all
     fifteen properly and three answers underneath them.
     shortLabel is for the phone tab bar only, where six destinations share the width of one thumb reach.
     The desktop rail and every page title still use label. */
  /* "Moves" existed because seven destinations shared one thumb reach and Transfers would not fit. News
     has gone, so there are six, and the word that names the page can be the word on the tab. */
  Object.freeze({ key: "transfers", label: "Transfer", href: "/transfers" }),
  Object.freeze({ key: "players", label: "Players", href: "/players" }),
  /* Line-ups is kept off both menus (the desktop bar and the phone's More sheet). The page still works at
     /lineups and from its Dashboard tile. */
  Object.freeze({ key: "lineups", label: "Line-ups", href: "/lineups", inMenu: false }),
  Object.freeze({ key: "fixtures", label: "Fixtures", href: "/fixtures" }),
  Object.freeze({ key: "attacks", label: "Attacks", href: "/attacks" }),
  Object.freeze({ key: "defences", label: "Defences", href: "/defences" }),
]);

/* SETTINGS. Not one of the main pages: a gear at the right of the desktop bar, and the last item in the
   phone's More sheet. Holds choices that change the whole site, such as which projections are used. */
export const SETTINGS_ROUTE = Object.freeze({ key: "settings", label: "Settings", href: "/settings" });
export const ALL_ROUTES = Object.freeze([...PRIMARY_ROUTES, SETTINGS_ROUTE]);
/* The destinations listed in the desktop menu bar. */
export const MENU_ROUTES = Object.freeze(PRIMARY_ROUTES.filter((route) => route.inMenu !== false));

/* THE PHONE TAB BAR. Six destinations plus a More tab; the rest open from More in a sheet. Home sits at the
   left; Transfer lives in More. */
export const MOBILE_TAB_KEYS = Object.freeze(["dashboard", "builder", "squad", "players", "attacks", "defences"]);
export const MOBILE_MORE_KEYS = Object.freeze(["transfers", "fixtures", "settings"]);

export const DASHBOARD_TILE_KEYS = Object.freeze(["builder", "squad", "players", "lineups"]);

const ROUTES_BY_KEY = new Map(PRIMARY_ROUTES.map((route) => [route.key, route]));

export function routeForKey(key) {
  return ROUTES_BY_KEY.get(key) || null;
}

export function routeTitleMap(extra = {}) {
  return Object.freeze({
    ...Object.fromEntries(ALL_ROUTES.map((route) => [route.href, route.label])),
    ...extra,
  });
}
