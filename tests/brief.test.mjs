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

test("the bench boost solver maximises all fifteen and is never worse than an ordinary squad", async () => {
  /* The first attempt reused the ordinary builder across every formation and gained exactly nothing, because
     that builder spends the budget on the eleven and fills the bench with the cheapest legal bodies. The
     second attempt, greedy from the cheapest fifteen, came out WORSE than an ordinary squad: the first big
     upgrade ate the budget and nothing else could be improved.
     What fixed it was seeding from the ordinary squad, so the answer can never be worse than the squad it
     started from, and running the swap pass twice, once on value per pound and once on raw gain. */
  const { bestFifteenAllPlaying } = await import("../lib/solver/optimise.mjs");
  const { bestXI } = await import("../lib/solver/autobuild.mjs");

  const pool = []; let id = 1;
  const add = (pos, price, xp, team) => pool.push({ fpl_id: id++, position: pos, price, xp, team_id: team, web_name: pos + price });
  for (let t = 1; t <= 20; t++) {
    add("GKP", 5.5, 4.2, t); add("GKP", 4.0, 1.0, t);
    for (let i = 0; i < 6; i++) add("DEF", 4.0 + i * 0.8, 1.2 + i * 0.75, t);
    for (let i = 0; i < 6; i++) add("MID", 4.5 + i * 1.4, 1.4 + i * 1.05, t);
    for (let i = 0; i < 4; i++) add("FWD", 5.0 + i * 2.5, 1.8 + i * 1.7, t);
  }
  const xpOf = (p) => p.xp;
  const normal = bestXI({ pool, xpOf });
  const seed = [...normal.xi, ...normal.bench];
  const normalTotal = seed.reduce((a, p) => a + p.xp, 0);

  const bb = bestFifteenAllPlaying({ pool, xpOf, seed });
  assert.ok(bb, "a bench boost squad must be found");

  assert.ok(bb.total >= normalTotal - 1e-9,
    `a squad built for the chip must not be worse across fifteen: ${bb.total} against ${normalTotal.toFixed(1)}`);
  assert.ok(bb.total > normalTotal, "and on a pool with a real value curve it should be strictly better");

  // Legal in every respect, or the answer is useless.
  const comp = {};
  for (const p of bb.players) comp[p.position] = (comp[p.position] || 0) + 1;
  assert.deepEqual(comp, { GKP: 2, DEF: 5, MID: 5, FWD: 3 }, "the squad composition must be legal");
  assert.equal(bb.players.length, 15);
  assert.ok(bb.spend <= 100 + 1e-9, `must fit the budget, spent ${bb.spend}`);
  const clubs = new Map();
  for (const p of bb.players) clubs.set(p.team_id, (clubs.get(p.team_id) || 0) + 1);
  assert.ok(Math.max(...clubs.values()) <= 3, "no more than three from a club");
  assert.equal(new Set(bb.players.map((p) => p.fpl_id)).size, 15, "no player twice");

  // Captain and vice must be set, and be different players.
  assert.ok(bb.captain && bb.vice && bb.captain !== bb.vice, "armbands on two different players");
});

test("the optimise endpoint is read only and explains the trade", () => {
  const src = readFileSync("app/api/optimise/route.js", "utf8");
  assert.match(src, /export async function GET/);
  assert.ok(!/export async function (POST|PUT|DELETE|PATCH)/.test(src), "no writes");
  assert.match(src, /bestFifteenAllPlaying/, "it uses the all-fifteen solver, not the ordinary builder");
  assert.match(src, /THE TRADE/, "and states what building for the chip costs the eleven");
  assert.match(src, /never been checked against a played gameweek/, "and that the numbers are estimates");
});

test("the brief leads with Louis's own squad and can be pointed at any draft", () => {
  /* The first two versions of this brief shipped without his squad in it, while the plans rows were being
     fetched and discarded. Almost every question he asks is about the team he owns, so it goes first. */
  const src = readFileSync("app/api/brief/route.js", "utf8");

  assert.match(src, /LOUIS'S SQUAD/, "his squad must be a section of the brief");
  assert.match(src, /SAVED DRAFTS:/, "every draft is named, so another can be asked for");

  // Which draft: named one if asked for, else the active one, else the newest.
  assert.match(src, /const wanted = \(url\.searchParams\.get\("plan"\)/, "a draft can be chosen by name");
  assert.match(src, /byName \|\| plans\.find\(\(x\) => x\.is_active\) \|\| plans\[0\]/,
    "named, then active, then newest");
  assert.match(src, /Nothing matched/, "and it says so when a name does not match, rather than pretending");

  // The things that make it useful rather than a bare list.
  for (const [what, re] of [
    ["who is starting", /startIds\.has\(r\.b\.fpl_id\) \? "starting" : "bench"/],
    ["the captain", /captain === r\.b\.fpl_id \? "CAPTAIN"/],
    ["money in the bank", /in the bank/],
    ["ownership per player", /r\.pl\.own/],
    ["the shortlist", /shortlisted:/],
    ["players ruled out", /ruled out, do not suggest these:/],
  ]) assert.match(src, re, `the squad section must show ${what}`);

  // An empty database must not be silently rendered as an empty squad.
  assert.match(src, /No saved draft yet/, "with no drafts it says so plainly");

  // And the loader has to actually hand the plans over, sorted newest first.
  const loader = readFileSync("lib/server/load.mjs", "utf8");
  assert.match(loader, /const plans = \(planRows \|\| \[\]\)/, "the loader returns the drafts");
  assert.match(loader, /localeCompare\(String\(a\.updated_at/, "newest first");
  assert.match(loader, /scale, minutes, plans,/, "and they reach the caller");
});

test("what top managers own is a real source, and says so when it does not exist yet", () => {
  /* The one question no projection answers and no content creator answers either. Overall ownership is the
     template; ownership among the best few hundred is what people who are winning think; and the GAP is the
     differential signal a rank one target needs. */
  const src = readFileSync("app/api/elite/route.js", "utf8");

  assert.match(src, /leagues-classic\/314\/standings/, "it reads the real overall table");
  assert.match(src, /entry\/\$\{m\.entry\}\/event\/\$\{readGw\}\/picks/, "and each manager's actual squad");
  assert.match(src, /export async function GET/);
  assert.ok(!/export async function (POST|PUT|DELETE|PATCH)/.test(src), "read only");

  // The gap in both directions is the point, not just a most-owned list.
  assert.match(src, /BACKED BY THE TOP/, "players the elite back more than the field");
  assert.match(src, /OWNED BY THE FIELD MORE THAN BY THE TOP/, "and template players they avoid");
  assert.match(src, /gap: elite - overall/, "computed as elite minus overall");
  assert.match(src, /WHO THEY CAPTAINED/, "and the captaincy split");

  // Pre-season honesty. The table exists but is empty, and that must not be papered over.
  assert.match(src, /no gameweek has been scored yet/, "it states when the data cannot exist");
  assert.match(src, /Do not substitute content creators for this/,
    "and forbids substituting sentiment for evidence");
  // Early-season caveat, because topping the table after two gameweeks is mostly luck.
  assert.match(src, /partly luck/, "it flags that an early sample is weak");
  // One unreadable manager must not sink the whole answer.
  assert.match(src, /One unreadable manager is not a reason to fail/, "it tolerates a failed read");
});
