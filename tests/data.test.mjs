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

test("the dashboard fixture section cannot be empty while fixtures exist", async () => {
  // The old version returned null whenever one club's strength field was missing, so the whole card was
  // blank. It is now built on the difficulty scale, which chooses its basis by coverage.
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("app/page.jsx", "utf8");
  const outlook = readFileSync("components/FixtureOutlook.jsx", "utf8");
  assert.match(outlook, /scale\.difficultyOf\(f\.oppId, f\.home\)/, "difficulty comes from the shared scale");
  assert.ok(!/fixtureSwings/.test(page), "the old strength-dependent helper is no longer used");
  assert.ok(!/Donut/.test(page), "the Top 10 donut is removed");
  assert.ok(!/Most owned/.test(page), "and the Players section is off the Dashboard");
  for (const [name, src] of [["page", page], ["outlook", outlook]]) {
    assert.ok(!/\bruns?\b/i.test((src.match(/"[^"]+"/g) || []).join(" ")), `${name} must not say run or runs`);
  }
  // Ten a side, one shared toggle with three views.
  assert.match(outlook, /rows\.slice\(0, 10\)/, "ten best");
  assert.match(outlook, /\[\.\.\.rows\]\.reverse\(\)\.slice\(0, 10\)/, "and ten worst");
  for (const v of ["OVERALL", "ATTACK", "DEFENCE"]) assert.ok(outlook.includes(v), `${v} view`);
  assert.match(outlook, /const \[view, setView\]/, "one toggle drives both sides");
});

test("news has two sections and notices are a card grid", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/news/NewsClient.jsx", "utf8");
  const sections = [...src.matchAll(/<Section eyebrow="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["Noticed", "Price moves"], "only the two that hold content");
  assert.match(src, /repeat\(auto-fill, minmax\(300px, 1fr\)\)/, "notices are a grid, roughly four across");
  assert.match(src, /lang\(16, 700\)/, "with a readable headline, not 13px");
});

test("line-ups shows two teams on pitches, defaulting to Arsenal and Man City", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.match(src, /find\("ARS"\)/, "Arsenal on the left by default");
  assert.match(src, /find\("MCI"\)/, "Manchester City on the right");
  assert.match(src, /<BuilderPitch/, "drawn on the same pitch as the rest of the product");
  assert.equal((src.match(/<TeamPanel/g) || []).length, 2, "two panels");
  // The bench is the three likeliest substitutes, and nobody implausible is listed.
  assert.match(src, /\.slice\(0, 3\)/, "at most three substitutes, the ones the source lists first");
  // No coverage count, no per-player list, no club grid.
  assert.ok(!/minutes forecast for \{/.test(src) || !/of \{core\.players\.length\}/.test(src));
});

test("the line-ups page never invents an eleven", async () => {
  // With no minutes forecasts, startProbOf returns null for everyone, so the modelled eleven scored every
  // player zero, the sort did nothing, and the page drew the first eleven rows in table order: old players
  // in an arbitrary shape, every club looking the same. A fabricated line-up is worse than an empty state
  // because it looks like an answer. The shape now comes from the source or the panel says it is not loaded.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.ok(!/function predict\(/.test(src), "no modelled eleven is computed here");
  assert.ok(!/BENCH_MIN/.test(src), "and none of its supporting constants remain");
  assert.match(src, /const squad = fromSource;/, "the published eleven is the only source");
  assert.match(src, /Run lineups-pull in the Actions tab/, "and an empty state says what to run");
});

test("the line-ups pull derives the formation from the source's own positions", async () => {
  // Our minutes model answers "how likely is he to start", which is a forecast. "Who does the manager
  // pick" is reporting, and the published source follows press conferences and leaks. The formation comes
  // from the detailed positions it publishes, which is what produces real shapes rather than one shape
  // for every club.
  const { readFileSync } = await import("node:fs");
  const job = readFileSync("jobs/lineups_pull.mjs", "utf8");
  assert.match(job, /fantasyfootballpundit\.com\/fantasy-premier-league-team-news/, "the agreed source");
  assert.match(job, /RWB: "DEF"/, "wing backs count as defenders");
  assert.match(job, /DCM: "MID"/, "holding midfielders as midfielders");
  assert.match(job, /if \(count\.DEF \+ count\.MID \+ count\.FWD !== 10\) return null;/,
    "an eleven that does not add up returns no formation rather than a guessed one");
  assert.match(job, /not\("archive", "is", true\)/, "archive players cannot be matched by name");
  assert.match(job, /It challenges automated requests/, "a blocked fetch says so and writes nothing");

  // Position codes map to the three lines, verified on the real published shapes.
  const LINE = {
    GK: "GK", RB: "DEF", LB: "DEF", CB: "DEF", RWB: "DEF", LWB: "DEF",
    DCM: "MID", ACM: "MID", CM: "MID", RM: "MID", LM: "MID",
    CF: "FWD", RF: "FWD", LF: "FWD",
  };
  const shape = (codes) => {
    const c = { DEF: 0, MID: 0, FWD: 0 };
    for (const k of codes) { const l = LINE[k]; if (l && l !== "GK") c[l] += 1; }
    return `${c.DEF}-${c.MID}-${c.FWD}`;
  };
  // Crystal Palace as published: three centre backs, two wing backs, two in midfield, three forward.
  assert.equal(shape(["GK", "RWB", "LWB", "CB", "CB", "CB", "CM", "CM", "RF", "LF", "CF"]), "5-2-3");
  // Leeds as published.
  assert.equal(shape(["GK", "RWB", "LWB", "CB", "CB", "CB", "CM", "CM", "RM", "LM", "CF"]), "5-4-1");
  // Arsenal as published.
  assert.equal(shape(["GK", "RB", "LB", "CB", "CB", "DCM", "DCM", "ACM", "RM", "LM", "CF"]), "4-5-1");
});

test("the line-ups page says which source is on screen", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.match(src, /predicted_lineups/, "it reads the published table");
  assert.match(src, /const squad = fromSource;/, "and uses nothing else");
  assert.match(src, /TEAM NEWS/, "labelled as team news, with the source's own date");
  assert.ok(!/OUR MINUTES MODEL/.test(src), "there is no model on this page to confuse it with");
  assert.match(src, /xi\.length < 9\) return null/, "too few matched players shows the empty state, not a gapped pitch");
});

test("a club name is short, so it can never blow the index it keys", async () => {
  // The first live run failed with "index row size 6648 exceeds btree maximum 2704". The club name is read
  // from a heading, and a non-greedy tag-pair capture still runs on when a heading is never closed, so one
  // club name became a whole section.
  const { readFileSync } = await import("node:fs");
  const job = readFileSync("jobs/lineups_pull.mjs", "utf8");
  assert.match(job, /Predicted Lineup\/gi\)\]/, "the phrase is matched directly, not a tag pair");
  assert.match(job, /club\.length > 28\) continue/, "an implausible club name is skipped at parse time");
  assert.match(job, /r\.club\.length <= 28 && r\.starters\.length === 11/, "and again before the write");

  // The regex the job uses, against the exact shape that broke it.
  const re = /<h[12][^>]*>\s*([A-Za-z][A-Za-z'’.\- ]{1,28}?)\s+Predicted Lineup/gi;
  const broken = "<h2>Arsenal Predicted Lineup<h2>Aston Villa Predicted Lineup</h2>";
  const found = [...broken.matchAll(re)].map((m) => m[1].trim());
  assert.deepEqual(found, ["Arsenal", "Aston Villa"], "an unclosed heading no longer swallows a section");
  for (const c of found) assert.ok(c.length <= 28);
});

test("club aliases are normalised the same way as the names they match", async () => {
  // Our own "Nott'm Forest" normalises to "nott m forest". An alias written with the apostrophe could
  // never have matched it, so the mapping was silently dead.
  const { readFileSync } = await import("node:fs");
  const job = readFileSync("jobs/lineups_pull.mjs", "utf8");
  assert.match(job, /"nottingham forest": "nott m forest"/, "the alias is stored normalised");
  assert.ok(!/"nott'm forest"/.test(job), "and not in a form norm() would never produce");

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(norm("Nott'm Forest"), "nott m forest", "which is what our club name becomes");
});
