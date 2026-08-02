import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DASHBOARD_TILE_KEYS, PRIMARY_ROUTES, routeForKey, routeTitleMap } from "../lib/routes.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("primary route registry is unique and its title map cannot drift", () => {
  assert.equal(new Set(PRIMARY_ROUTES.map((route) => route.key)).size, PRIMARY_ROUTES.length);
  assert.equal(new Set(PRIMARY_ROUTES.map((route) => route.href)).size, PRIMARY_ROUTES.length);
  const titles = routeTitleMap({ "/status": "Status" });
  for (const route of PRIMARY_ROUTES) {
    assert.equal(routeForKey(route.key), route);
    assert.equal(titles[route.href], route.label);
  }
  assert.equal(titles["/status"], "Status");
});

test("dashboard contains only the four current product destinations", () => {
  assert.deepEqual(DASHBOARD_TILE_KEYS, ["builder", "squad", "players", "lineups"]);
  assert.deepEqual(DASHBOARD_TILE_KEYS.map((key) => routeForKey(key).label),
    ["Builder", "Squad", "Players", "Line-ups"]);
  assert.deepEqual(DASHBOARD_TILE_KEYS.map((key) => routeForKey(key).href),
    ["/builder", "/squad", "/players", "/lineups"]);
});

test("every retained dashboard route has a real Next page", () => {
  for (const key of DASHBOARD_TILE_KEYS) {
    const route = routeForKey(key);
    const relative = route.href === "/" ? "app/page.jsx" : `app${route.href}/page.jsx`;
    assert.equal(existsSync(`${root}${relative}`), true, `${route.href} is missing ${relative}`);
  }
});

test("dashboard and sidebar consume the shared route registry with no stale shortcuts", () => {
  const dashboard = source("app/page.jsx");
  const shell = source("components/Shell.jsx");
  assert.match(dashboard, /DASHBOARD_TILE_KEYS/);
  assert.match(dashboard, /routeForKey/);
  assert.match(shell, /PRIMARY_ROUTES/);
  assert.match(shell, /routeTitleMap/);
  assert.doesNotMatch(dashboard, /players\?compare=1/);
  assert.doesNotMatch(dashboard, /href\s*=\s*["']\/analysis/);
  assert.doesNotMatch(dashboard, /GitCompareArrows|BarChart3/);
  assert.doesNotMatch(dashboard, /"Squad Builder"/);
});
