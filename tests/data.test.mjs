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
  // Three clubs play a back three in this set.
  const backThree = data.clubs.filter((c) => c.rows[1].length === 3).map((c) => c.short);
  assert.deepEqual(backThree.sort(), ["CRY", "HUL", "LEE"], "the back-three clubs are the ones published");
});

test("the line-ups page draws the file and derives nothing", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.match(src, /import LINEUPS from "\.\.\/\.\.\/config\/lineups\.json"/, "it reads the file");
  assert.match(src, /row\.rows\.map\(\(line\)/, "and draws the rows as given");
  assert.ok(!/function predict\(/.test(src), "it must not compute an eleven");
  assert.ok(!/predicted_lineups/.test(src), "and no longer reads the retired table");
  assert.match(src, /flexDirection: "column-reverse"/, "the goalkeeper is at the back, as on a pitch");
  // An unmatched name still renders rather than leaving a hole.
  assert.match(src, /player \? player\.web_name : name/, "an unmatched name still shows");
  assert.match(src, /NOT IN FPL/, "and says so plainly");
  assert.match(src, /TEAM NEWS · /, "the source and its date are on screen");
});

test("the retired scrape cannot run or look successful", async () => {
  const { readFileSync } = await import("node:fs");
  const job = readFileSync("jobs/lineups_pull.mjs", "utf8");
  assert.match(job, /RETIRED/, "the job says so");
  assert.match(job, /process\.exit\(1\)/, "and exits non-zero, so a schedule cannot look green");
  const tidy = readFileSync(".github/workflows/tidy.yml", "utf8");
  for (const f of ["jobs/lineups_pull.mjs", ".github/workflows/lineups-pull.yml",
                   "supabase/migration-023.sql", "supabase/migration-024.sql"]) {
    assert.ok(tidy.includes(f), `tidy must delete ${f}`);
  }
});
