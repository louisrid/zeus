import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(path, "utf8");

test("both external query endpoints require the server-only read token", () => {
  const auth = source("lib/read-only-api-auth.mjs");
  assert.match(auth, /ZEUS_READ_ONLY_TOKEN/);
  assert.match(auth, /timingSafeEqual/);
  for (const path of ["app/api/players/query/route.js", "app/api/fixtures/query/route.js"]) {
    const route = source(path);
    assert.match(route, /authoriseReadOnlyRequest/);
    assert.match(route, /force-dynamic/);
  }
});

test("all player surfaces consume the shared query module instead of owning filters, sorting or summation", () => {
  const players = source("app/players/page.jsx");
  const projections = source("app/projections/page.jsx");
  const fixtures = source("app/fixtures/page.jsx");
  assert.match(players, /filterPlayerRows, sortPlayerRows, sumGameweekValues/);
  assert.match(players, /sumGameweekValues\(/);
  assert.match(players, /filterPlayerRows\(/);
  assert.match(players, /sortPlayerRows\(/);
  assert.match(projections, /queryPlayersFromDatabase/);
  assert.match(fixtures, /queryFixturesFromDatabase/);
  assert.doesNotMatch(projections, /scoreForGw|reduce\(.*xpts|\.sort\(/s);
});

test("the Players page removes the eight-gameweek and 200-player caps and adds ownership filtering", () => {
  const page = source("app/players/page.jsx");
  const controls = source("components/PlayerControls.jsx");
  assert.doesNotMatch(page, /firstGw \+ 7/);
  assert.doesNotMatch(page, /list\.slice\(0, 200\)/);
  assert.match(page, /ownershipMin: ownership\[0\]/);
  assert.match(page, /ownershipMax: ownership\[1\]/);
  assert.match(controls, /label="OWNERSHIP"/);
});

test("the projections page exposes per-GW data and CSV export", () => {
  const page = source("app/projections/page.jsx");
  const table = source("components/ProjectionQueryPage.jsx");
  const csv = source("components/CsvDownloadButton.jsx");
  assert.match(page, /includeBreakdown: true/);
  assert.match(page, /allowCsv/);
  assert.match(table, /gameweeks\.map/);
  assert.match(csv, /text\/csv/);
});

