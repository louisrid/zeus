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
  const src = readFileSync("app/page.jsx", "utf8");
  assert.match(src, /scale\.difficultyOf\(f\.oppId, f\.home\)/, "difficulty comes from the shared scale");
  assert.ok(!/fixtureSwings/.test(src), "the old strength-dependent helper is no longer used");
  assert.ok(!/Donut/.test(src), "the Top 10 donut is removed");
  assert.ok(!/\bruns?\b/i.test((src.match(/"[^"]+"/g) || []).join(" ")), "and no wording about runs");
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
  assert.match(src, /const BENCH_MIN = 0\.10;/, "a floor on who counts as a likely substitute");
  assert.match(src, /\.slice\(0, 3\)/, "three of them");
  // No coverage count, no per-player list, no club grid.
  assert.ok(!/minutes forecast for \{/.test(src) || !/of \{core\.players\.length\}/.test(src));
});
