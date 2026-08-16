import test from "node:test";
import assert from "node:assert/strict";

test("blank and double gameweeks are detected exactly from the fixture list", async () => {
  const { blanksAndDoubles } = await import("../lib/data.js");
  const fixtures = [
    { gw: 30, home_team: 1, away_team: 2 }, { gw: 30, home_team: 3, away_team: 4 },
    { gw: 31, home_team: 1, away_team: 3 }, { gw: 31, home_team: 1, away_team: 4 }, // club 1 doubles, club 2 blanks
    { gw: 32, home_team: 1, away_team: 2 }, { gw: 32, home_team: 3, away_team: 4 },
  ];
  const out = blanksAndDoubles(fixtures, [1, 2, 3, 4]);
  assert.equal(out.length, 1, "only the irregular gameweek is reported");
  assert.equal(out[0].gw, 31);
  assert.deepEqual(out[0].doubles, [1]);
  assert.deepEqual(out[0].blanks, [2]);
});

test("fixture outlook logic remains available while the dashboard widget stays removed", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("app/page.jsx", "utf8");
  const outlook = readFileSync("components/FixtureOutlook.jsx", "utf8");
  const helper = readFileSync("lib/fixture-outlook.mjs", "utf8");
  assert.match(outlook, /buildFixtureOutlook/);
  assert.match(helper, /scale\.difficultyOf\(opponent\.id, fixture\.home\)/);
  assert.match(outlook, /EASIEST FOR ATTACK/);
  assert.match(outlook, /EASIEST FOR DEFENCE/);
  assert.doesNotMatch(outlook, /OVERALL|Worst fixtures|Fixtures not published yet/);
  assert.doesNotMatch(page, /FixtureOutlook|Easiest fixtures ahead/, "fixture data remains available without the dashboard widget");
});

test("news has two sections and notices are a card grid", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/news/NewsClient.jsx", "utf8");
  const sections = [...src.matchAll(/<Section eyebrow="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["Noticed", "Price moves"], "only the two that hold content");
  assert.match(src, /repeat\(auto-fill, minmax\(300px, 1fr\)\)/, "notices are a grid, roughly four across");
  assert.match(src, /lang\(16, 700\)/, "with a readable headline, not 13px");
});







test("every club has a line-up of exactly eleven, drawn as the source draws it", async () => {
  // Twenty clubs came out as 4-5-1 with the wrong players because the page derived a shape from a model
  // with no pre-season signal. The rows are now transcribed from the source's own graphics, so the shape
  // is data rather than a guess. What can go wrong here is a transcription error, so that is what is checked.
  const { readFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync("config/lineups.json", "utf8"));

  assert.equal(data.clubs.length, 20, "twenty clubs");
  const shorts = data.clubs.map((c) => c.short);
  assert.equal(new Set(shorts).size, 20, "no club listed twice");

  for (const c of data.clubs) {
    const players = c.rows.flat();
    assert.equal(players.length, 11, `${c.club} must have eleven players, has ${players.length}`);
    assert.equal(new Set(players.map((n) => n.toLowerCase())).size, 11, `${c.club} lists someone twice`);
    assert.equal(c.rows[0].length, 1, `${c.club} must have exactly one goalkeeper`);
    assert.ok(c.rows.length >= 4, `${c.club} must have a goalkeeper and at least three lines`);
    assert.ok(c.fixture && /\((H|A)\)$/.test(c.fixture), `${c.club} needs a fixture with a venue`);
    assert.ok(c.updated, `${c.club} needs the source's own date`);
  }

  // The shapes must actually vary, which is the whole complaint.
  const shapes = new Set(data.clubs.map((c) => c.rows.slice(1).map((r) => r.length).join("-")));
  assert.ok(shapes.size >= 3, `expected several formations, got ${[...shapes].join(", ")}`);
  assert.ok(!shapes.has("4-5-1"), "and not the one every club wrongly showed");
  // Which clubs play a back three is data, not a constant: it changes whenever the source republishes.
  // What must hold is that the shape is read from the file rather than assumed, and that a back three is
  // recorded as three defenders rather than being flattened into a back four.
  const backThree = data.clubs.filter((c) => c.rows[1].length === 3).map((c) => c.short).sort();
  assert.deepEqual(backThree, ["CHE", "CRY", "LEE", "NFO"], "the back-three clubs are the ones published");
  for (const c of data.clubs) {
    assert.ok([3, 4, 5].includes(c.rows[1].length), `${c.club} has an illegal defensive line`);
  }
});

test("the line-ups page draws the file and derives nothing", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.match(src, /import LINEUPS from "\.\.\/\.\.\/config\/lineups\.json"/, "it reads the file");
  assert.match(src, /resolved\.map\(\(line/, "and draws the resolved rows as given");
  assert.ok(!/function predict\(/.test(src), "it must not compute an eleven");
  assert.ok(!/predicted_lineups/.test(src), "and no longer reads the retired table");
  assert.match(src, /<PitchSurface/, "it uses the shared pitch, so it looks like the rest of the product");
  // An unmatched name still renders rather than leaving a hole.
  assert.match(src, /player \? player\.web_name : name/, "an unmatched name still shows");
  assert.match(src, /resolveLineups\(LINEUPS\.clubs/, "and it shares the resolver the model uses, so they cannot disagree");
  /* The wording changed with the tile: price is no longer shown beside a shirt, so an unmatched name is
     described by what is actually missing, which is the player rather than his price. */
  assert.match(src, /Not in the player list yet/, "and says so in plain words, not jargon");
  assert.match(src, /TEAM NEWS · /, "the source and its date are on screen");
});

test("the retired lineup scrape and its obsolete migrations stay deleted", async () => {
  const { existsSync } = await import("node:fs");
  for (const file of [
    "jobs/lineups_pull.mjs",
    ".github/workflows/lineups-pull.yml",
    "supabase/migration-023.sql",
    "supabase/migration-024.sql",
  ]) assert.equal(existsSync(file), false, `${file} must not return after repository cleanup`);
});

test("published names resolve league-wide, and refuse rather than guess", async () => {
  // Igor Jesus, Lacroix and Joao Pedro all read as "not in FPL". The matcher searched only inside the club
  // the source names, so a player who has moved could never be found, and a surname that is not the FPL
  // short name failed outright.
  const { resolveName } = await import("../lib/lineups.mjs");
  const players = [
    { fpl_id: 1, web_name: "Igor Jesus", name: "Igor Jesus", team_id: 18 },
    { fpl_id: 2, web_name: "G.Jesus", name: "Gabriel Jesus", team_id: 1 },
    { fpl_id: 3, web_name: "Lacroix", name: "Maxence Lacroix", team_id: 8 },
    { fpl_id: 4, web_name: "João Pedro", name: "Joao Pedro Junqueira de Jesus", team_id: 6 },
    { fpl_id: 5, web_name: "Pedro Neto", name: "Pedro Neto", team_id: 6 },
    { fpl_id: 6, web_name: "Fernandes", name: "Bruno Fernandes", team_id: 16 },
    { fpl_id: 7, web_name: "M.Fernandes", name: "Mateus Fernandes", team_id: 20 },
    { fpl_id: 8, web_name: "Mac Allister", name: "Alexis Mac Allister", team_id: 14 },
    { fpl_id: 9, web_name: "Rayan", name: "Rayan Ait-Nouri", team_id: 15 },
    { fpl_id: 10, web_name: "Rayan", name: "Rayan", team_id: 3 },
  ];
  const at = (name, club) => { const p = resolveName(name, players, club); return p ? p.fpl_id : null; };

  assert.equal(at("Igor Jesus", 18), 1, "Igor Jesus, not Gabriel Jesus");
  assert.equal(at("Lacroix", 6), 3, "found at another club, because the source knows about the move");
  assert.equal(at("Joao Pedro", 6), 4, "two-token name, not Pedro Neto");
  assert.equal(at("Neto", 6), 5, "and Neto is still Neto");
  assert.equal(at("Fernandes", 16), 6, "Bruno at Man Utd");
  assert.equal(at("Fernandes", 20), 7, "Mateus at Tottenham: the club breaks the tie");
  assert.equal(at("Mac Allister", 14), 8, "a space inside the surname");
  // A real ambiguity must refuse. A wrong player is worse than an unmatched one.
  assert.equal(at("Rayan", 99), null, "two players share the name and neither is at the named club");
});

test("a published eleven drives the minutes, and a naming failure cannot crush a club", async () => {
  /* Two faults, one after the other.
   *
   * First: the forecast table is empty before the season, so every player scored zero and xPTS was
   * meaningless everywhere. A published eleven is the strongest minutes evidence there is, so it is used.
   *
   * Then: treating a player as a substitute costs him roughly six sevenths of his xPTS. When a club's names
   * failed to resolve, everyone there looked unnamed and the whole club collapsed. That is what Louis saw,
   * Nottingham Forest reading 0.7 to 2.1 instead of 3 to 5. A club now only gets substitute numbers when at
   * least nine of its eleven resolved. */
  const { minutesWithLineups, LINEUP_MINUTES } = await import("../lib/lineups.mjs");
  const LINEUPS = JSON.parse((await import("node:fs")).readFileSync("config/lineups.json", "utf8"));
  const teams = [{ id: 18, name: "Nottingham Forest", short_name: "NFO" }];
  const mk = (names, from) => names.map((n, i) => ({
    fpl_id: from + i, web_name: n, name: n, team_id: 18, position: n === "Sels" ? "GKP" : "MID",
  }));

  // The eleven exactly as published, plus two squad players.
  const resolves = mk(["Sels", "Jair", "Milenkovic", "Murillo", "Aina", "Nicolás Domínguez", "Sangaré",
    "Williams", "Gibbs-White", "Igor Jesus", "Wood", "Ndoye", "Yates"], 1);
  const good = minutesWithLineups(LINEUPS.clubs, new Map(), resolves, teams);
  for (const p of resolves.slice(0, 11)) {
    assert.equal(good.get(p.fpl_id).p_start, LINEUP_MINUTES.starter.p_start, `${p.web_name} is a named starter`);
  }
  for (const p of resolves.slice(11)) {
    assert.equal(good.get(p.fpl_id).p_start, LINEUP_MINUTES.notNamed.p_start, `${p.web_name} is a substitute`);
  }
  assert.equal(LINEUP_MINUTES.starter.p_start, 1,
    "a player named in a validated predicted eleven is starting");
  assert.equal(LINEUP_MINUTES.notNamed.p_start, 0,
    "a player outside a validated predicted eleven cannot start");

  // THE GUARD: names that resolve to nobody must leave the club's minutes untouched.
  const fails = mk(["Zz1", "Zz2", "Zz3", "Zz4", "Zz5", "Zz6", "Zz7", "Zz8", "Zz9", "Zz10", "Zz11", "Zz12"], 500);
  const before = new Map([[500, { p_start: 0.8, exp_min_start: 85, p_cameo: 0.1, exp_min_cameo: 20 }]]);
  const bad = minutesWithLineups(LINEUPS.clubs, before, fails, teams);
  const demoted = fails.filter((p) => { const m = bad.get(p.fpl_id); return m && m.p_start === LINEUP_MINUTES.notNamed.p_start; });
  assert.equal(demoted.length, 0, "no club may be demoted wholesale because its names did not resolve");
  assert.equal(bad.get(500).p_start, 0.8, "and an existing forecast is left exactly as it was");

  // A club with no published eleven at all is never touched.
  const other = [{ fpl_id: 900, web_name: "X", name: "X", team_id: 99, position: "MID" }];
  const kept = minutesWithLineups(LINEUPS.clubs, new Map([[900, { p_start: 0.5 }]]), other, teams);
  assert.equal(kept.get(900).p_start, 0.5);
});
