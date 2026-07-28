// The brief endpoint and the blank/double detection behind it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { blanksAndDoubles, fixtureCounts } from "../lib/server/fixtures.mjs";

test("blanks and doubles are detected from the fixture list", () => {
  /* Chip timing is mostly this question and nothing computed it before, so any answer about when to play a
     bench boost or a free hit was guesswork. */
  const ids = [1, 2, 3, 4];
  const fx = [
    { gw: 1, home_team: 1, away_team: 2 }, { gw: 1, home_team: 3, away_team: 4 },
    { gw: 2, home_team: 1, away_team: 2 },
    { gw: 3, home_team: 1, away_team: 3 }, { gw: 3, home_team: 1, away_team: 4 }, { gw: 3, home_team: 2, away_team: 3 },
  ];
  const { blanks, doubles } = blanksAndDoubles(fx, ids, 1, 3);

  assert.equal(blanks.has(1), false, "everyone plays in GW1");
  assert.equal(doubles.has(1), false);
  assert.deepEqual((blanks.get(2) || []).sort(), [3, 4], "GW2 blanks for the clubs with no fixture");
  assert.deepEqual((doubles.get(3) || []).sort(), [1, 3], "GW3 doubles for the clubs playing twice");

  // A gameweek outside the window is ignored entirely.
  const { blanks: b2 } = blanksAndDoubles(fx, ids, 2, 2);
  assert.deepEqual((b2.get(2) || []).sort(), [3, 4]);

  // Missing team ids must not be counted.
  const counts = fixtureCounts([{ gw: 1, home_team: 1, away_team: null }], 1, 1);
  assert.equal(counts.get("1:1"), 1);
  assert.equal(counts.size, 1, "a null opponent is not a club");
});

test("the brief is plain text, read only, and states what it cannot know", () => {
  const f = "app/api/brief/route.js";
  assert.ok(existsSync(f), "the brief endpoint must exist");
  const src = readFileSync(f, "utf8");

  assert.match(src, /export async function GET/, "read only: GET and nothing else");
  assert.ok(!/export async function (POST|PUT|DELETE|PATCH)/.test(src), "no writes from this route");
  assert.match(src, /text\/plain/, "plain text, because a model reads it directly");
  assert.match(src, /force-dynamic/, "never cached, or the numbers go stale");

  // The honesty section is the point, not decoration.
  assert.match(src, /never been checked against a played gameweek/, "it must declare what is unvalidated");
  assert.match(src, /Ownership is today's snapshot/, "and that ownership moves");

  // The things that make it useful for strategy rather than just a squad dump.
  for (const [what, re] of [
    ["blanks and doubles", /BLANK AND DOUBLE GAMEWEEKS/],
    ["the market by position", /TOP \$\{depth\} PER POSITION/],
    ["value per million", /BEST xPTS PER MILLION/],
    ["the template", /MOST OWNED/],
    ["fixture runs", /FIXTURES GW\$\{gw\} TO GW\$\{lastGw\}/],
  ]) assert.match(src, re, `the brief must include ${what}`);
});

test("the server loader does not import a client module", () => {
  /* lib/data.js and lib/projections.js hold React state, so a route cannot import them. The loader reads the
     tables itself and hands them to the same scorer, which is what keeps a chat and a screen in agreement. */
  const src = readFileSync("lib/server/load.mjs", "utf8");
  assert.ok(!/from "\.\.\/data"/.test(src) && !/from "\.\.\/projections/.test(src),
    "the loader must not pull in the browser data layer");
  assert.match(src, /buildScorer/, "it uses the same scorer as the pages");
  assert.match(src, /minutesWithLineups/, "and the same published line-ups");
  // The directive itself, at the top of the file, not the comment explaining why it is absent.
  const scorer = readFileSync("lib/solver/score.mjs", "utf8");
  assert.ok(!/^\s*["']use client["'];/m.test(scorer),
    "the scorer must stay importable on a server");
});

test("the brief excludes archive fixtures and relegated clubs", () => {
  /* The first live run showed West Ham, Wolves and Burnley, and a double gameweek for half the league in
     every week. Two causes: relegated clubs stay in the teams table, and the 2025/26 archive job writes
     fixtures that store one side of a match only, so counting them doubles everything. The browser filters
     both and the server loader did not. */
  const src = readFileSync("lib/server/load.mjs", "utf8");
  assert.match(src, /t\.archive !== true/, "relegated clubs are excluded");
  assert.match(src, /Number\(f\.fpl_id\) < ARCHIVE_OFFSET/, "archive fixtures are excluded");
  assert.match(src, /teamById\[f\.home_team\] && teamById\[f\.away_team\]/,
    "and a fixture against a club not in this season is dropped, so no opponent reads as a question mark");

  // The two copies of the constant must agree, since one cannot import the other.
  const server = readFileSync("lib/server/fixtures.mjs", "utf8").match(/ARCHIVE_OFFSET = (\d+)/);
  const browser = readFileSync("lib/data.js", "utf8").match(/ARCHIVE_OFFSET = (\d+)/);
  assert.ok(server && browser, "both files must define it");
  assert.equal(server[1], browser[1], "the server and browser copies must not drift apart");
});

test("prior-season rows are matched on the internal id, not the FPL id", () => {
  /* Matched on the wrong key, the lookup found nothing for most players, so they fell back to the position
     mean. Every forward without a match read exactly the same number and Haaland projected the same as a
     5.5m striker. */
  const src = readFileSync("lib/server/load.mjs", "utf8");
  assert.match(src, /byInternalId = new Map\(players\.map\(\(p\) => \[p\.id, p\]\)\)/,
    "the map is keyed on the internal id");
  assert.match(src, /byInternalId\.get\(r\.player_id\)/, "and the prior-season rows use it");
  assert.ok(!/players\.find\(\(x\) => x\.fpl_id === r\.player_id\)/.test(src),
    "the wrong lookup must not come back");
  // Minutes and penalty duty key the same way.
  assert.equal((src.match(/byInternalId\.get\(r\.player_id\)/g) || []).length, 3,
    "prior season, minutes and penalty duty all resolve through it");
});
