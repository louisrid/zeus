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
  assert.ok((src.match(/byInternalId\.get\(r\.player_id\)/g) || []).length >= 3,
    "prior season, minutes, penalty duty and the engine rows all resolve through it");
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

test("the loader uses the service key this project actually defines, and does not hide a failed read", () => {
  /* The brief reported "no saved drafts" while two existed. The loader looked for SUPABASE_SERVICE_ROLE_KEY,
     which this project does not define: app/api/plans uses SUPABASE_SERVICE_KEY. So it fell back to the anon
     key, which cannot read the plans table, and a .catch turned the failure into an empty list.
     A wrong answer that looks like a valid one is worse than an error, which is the whole lesson here. */
  const loader = readFileSync("lib/server/load.mjs", "utf8");
  const plansApi = readFileSync("app/api/plans/route.js", "utf8");

  // Whatever name the working endpoint uses, the loader must accept it.
  const used = plansApi.match(/process\.env\.(SUPABASE_SERVICE[A-Z_]*)/);
  assert.ok(used, "the plans endpoint must name a service key");
  assert.ok(loader.includes(used[1]),
    `the loader must accept ${used[1]}, the name this project actually uses`);

  // Reading the drafts must demand the service key rather than quietly returning nothing.
  assert.match(loader, /needsAdmin && !service/, "it refuses to pretend when the key is missing");
  assert.match(loader, /cannot see the plans table/, "and says why");
  assert.match(loader, /const client = db\(true\)/, "the loader asks for admin access");

  // And the plans read itself must not be wrapped in a catch.
  const plansLine = loader.slice(loader.indexOf('all(client, "plans"'), loader.indexOf('all(client, "plans"') + 90);
  assert.ok(!/catch/.test(plansLine), "a failed plans read must surface, not become an empty list");
});

test("per gameweek projections exist, because a total cannot be divided into one", () => {
  /* Asked to show a player's next six fixtures with a projection each, the model correctly refused: the
     brief carries one number for this week and one for the window, and nothing per gameweek. The data was
     always there, since the scorer projects any player for any gameweek. It was simply never exposed. */
  const src = readFileSync("app/api/compare/route.js", "utf8");

  assert.match(src, /scoreForGw\(p, g\)/, "it projects each gameweek separately");
  assert.match(src, /gameweek, opponent, xPTS/, "and shows the opponent beside each one");
  assert.match(src, /DOUBLE: /, "a double gameweek is labelled");
  assert.match(src, /BLANK, no fixture/, "and a blank");
  assert.match(src, /SIDE BY SIDE/, "several players can be compared in one table");
  assert.match(src, /Best per million/, "with value as well as total");
  assert.match(src, /Those differ, so the choice depends/,
    "and it says so when the highest total is not the best value, rather than picking silently");

  // A loose name must not resolve to a coin flip.
  assert.match(src, /so be more specific/, "an ambiguous name asks for a better one");
  assert.match(src, /no player found by that name/, "and an unknown name says so");

  // The honesty line, because a per-gameweek figure looks more precise than it is.
  assert.match(src, /A gap under half a point between two players is not a real difference/,
    "it must warn against reading precision into a small gap");

  assert.match(src, /export async function GET/);
  assert.ok(!/export async function (POST|PUT|DELETE|PATCH)/.test(src), "read only");
});

test("a per gameweek projection moves with the opponent", async () => {
  /* Three strikers each read the same figure for six straight gameweeks against completely different
     opponents. Pre-season there are no odds, so the goal-environment multiplier defaults to one and the
     scorer falls back to difficultyOf, which the server loader was not passing: I had called it by the wrong
     name and deleted it rather than fixing it. The browser always passed it, which is why the pages looked
     right and only a chat was wrong. */
  const { buildOpponentScale } = await import("../lib/opponent.js");
  const { buildScorer } = await import("../lib/solver/score.mjs");
  const F = JSON.parse(readFileSync("config/fitted-params.json", "utf8"));

  const teamById = {
    1: { id: 1, short_name: "ARS", strength: 5, xg_for: 2.1, xg_against: 0.9 },
    3: { id: 3, short_name: "HUL", strength: 2, xg_for: 0.9, xg_against: 2.1 },
    4: { id: 4, short_name: "COV", strength: 2, xg_for: 1.0, xg_against: 2.0 },
  };
  const fixtures = [
    { gw: 1, home_team: 3, away_team: 1 },  // hosting the strongest side
    { gw: 2, home_team: 3, away_team: 4 },  // hosting the weakest
  ];
  const p = { fpl_id: 1, position: "FWD", team_id: 3, status: "a", chance_of_playing: null, price: 8 };
  const scale = buildOpponentScale(teamById);
  const s = buildScorer({
    projections: new Map(), perGw: new Map(),
    archivePer90: new Map([[1, { pointsPer90: 4.5, nineties: 30 }]]), understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: F.position_points_per_start, players: [p],
    minutesForecasts: new Map([[1, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 }]]),
    hasFixture: (pl, g) => fixtures.some((f) => f.gw === g && (f.home_team === pl.team_id || f.away_team === pl.team_id)),
    difficultyOf: (pl, g) => {
      const f = fixtures.find((x) => x.gw === g && (x.home_team === pl.team_id || x.away_team === pl.team_id));
      if (!f) return null;
      const home = f.home_team === pl.team_id;
      const d = scale.difficultyOf(home ? f.away_team : f.home_team, home);
      return d ? d.difficulty : null;
    },
  });

  const hard = s.scoreForGw(p, 1);
  const easy = s.scoreForGw(p, 2);
  assert.ok(easy > hard, `the easier fixture must project higher: ${easy} against ${hard}`);
  assert.ok(easy - hard > 0.3, `and by a visible margin, got ${(easy - hard).toFixed(2)}`);
  // Never below the appearance points a starter collects regardless of opponent.
  assert.ok(hard > 2.0, `even the hardest fixture keeps the appearance points, got ${hard}`);

  // And the loader must actually supply both, or this only ever works in the browser.
  const loader = readFileSync("lib/server/load.mjs", "utf8");
  assert.match(loader, /hasFixture: \(pl, g\) =>/, "the server loader supplies hasFixture");
  assert.match(loader, /difficultyOf: \(pl, g\) =>/, "and difficultyOf, or every gameweek reads the same");
  assert.match(loader, /scale\.difficultyOf\(oppId, home\)/, "using the opponent and the venue");
});

test("the brief reads the engine's projections, or it can only ever report zero", () => {
  /* The brief said the engine covered 0 of 563 players. It passed an EMPTY set of engine projections to the
     scorer, so that figure was guaranteed regardless of what the database held. The browser has always read
     the projections table; the server loader simply never did, so the one number that told us which model was
     in use was meaningless. */
  const loader = readFileSync("lib/server/load.mjs", "utf8");
  assert.match(loader, /all\(client, "projections", "\*"\)/, "the engine's table must be loaded");
  assert.ok(!/projections: new Map\(\), perGw: new Map\(\)/.test(loader),
    "and passed to the scorer, not replaced with an empty set");
  assert.match(loader, /projections, perGw, archivePer90/, "both this gameweek and every gameweek");

  // Keyed by internal id like every other join here, since the tables do not share the FPL id.
  assert.match(loader, /const pl = byInternalId\.get\(r\.player_id\);\n\s*if \(!pl\) continue;\n\s*if \(Number\(r\.gw\) === gw\) projections\.set/,
    "rows must resolve through the internal id");

  // The quantiles carry the ceiling and floor, which is the point of a simulation over an average.
  assert.match(loader, /q\.p90 \?\? q\.p95/, "the upside must be carried through");
  assert.match(loader, /q\.p10 \?\? q\.p5/, "and the downside");
});

test("the brief checks whether the whole projection set is realistic", () => {
  /* A projection can look sensible one player at a time and be wrong as a set. Louis spotted that too many
     players were clearing 7, which no individual number reveals. The benchmark is measured from the FPL API
     rather than asserted: a player with minutes averages 4.31 points per ninety and 5.3 per cent clear 7. */
  const src = readFileSync("app/api/brief/route.js", "utf8");

  assert.match(src, /IS THE WHOLE SET PLAUSIBLE/, "the set must be checked, not just individual players");
  assert.match(src, /4\.31/, "against a measured average, not a guess");
  assert.match(src, /5\.3/, "and a measured share clearing 7");
  assert.match(src, /The benchmark is measured, not asserted/, "and it must say the benchmark is measured");

  // It must call out a problem in words rather than leaving a reader to compare numbers.
  assert.match(src, /THE SET IS INFLATED/, "an inflated average is named");
  assert.match(src, /THE TOP END IS INFLATED/, "and an inflated top end separately, since they differ");
  assert.match(src, /Discount the gap between a premium and a mid-price/,
    "with what to do about it, because that is the decision it affects");

  // And it must be able to conclude the model is fine, or it is just a complaint generator.
  assert.match(src, /The shape looks reasonable/, "it can also pass");
  assert.match(src, /may be underrated/, "and flag the opposite problem");
});

test("ceiling and haul chance are surfaced, because the average flattens what matters", () => {
  /* Haaland and Gabriel both came out at 6.4. A defender should not read equal to the best striker in the
     league. The cause is that the engine averages thousands of simulated matches, which flattens the weeks
     Haaland scores twice, and those weeks are the whole reason he costs 15m. The engine was already computing
     each player's ceiling and his chance of double figures, and nothing used either. */
  const brief = readFileSync("app/api/brief/route.js", "utf8");
  assert.match(brief, /CEILING this week, chance of 10\+/, "the market table must carry the ceiling and haul chance");
  assert.match(brief, /scorer\.bandOf/, "read from the engine's own distribution");
  assert.match(brief, /scorer\.tailOf/, "and its own haul probability");
  assert.match(brief, /highest by CEILING/, "the plausibility check must rank by ceiling too");
  assert.match(brief, /the ceiling list is the one that matters for a rank one push/,
    "and say which list matters, or a reader defaults to the average");

  const cmp = readFileSync("app/api/compare/route.js", "utf8");
  assert.match(cmp, /a good week .*a bad week/, "a comparison must show both ends, not one number");
  assert.match(cmp, /Highest ceiling/, "and name the highest ceiling separately from the highest total");
  assert.match(cmp, /can post fifteen, not players who reliably post five/,
    "and explain why that is the one to prefer here");
});
