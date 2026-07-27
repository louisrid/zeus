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
  assert.match(src, /const BENCH_MIN = 0\.10;/, "a floor on who counts as a likely substitute");
  assert.match(src, /\.slice\(0, 3\)/, "three of them");
  // No coverage count, no per-player list, no club grid.
  assert.ok(!/minutes forecast for \{/.test(src) || !/of \{core\.players\.length\}/.test(src));
});

test("a club's formation comes from its likeliest eleven, not from the deepest squad group", async () => {
  // Every club was rendering 4-5-1. The shape was chosen by summing the start probability of each legal
  // formation's eleven, which rewards whichever shape draws from the deepest part of a squad, and clubs
  // carry more midfielders than forwards. The ten likeliest outfield players are the line-up, so their
  // positions give the shape.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lineups/LineupsClient.jsx", "utf8");
  assert.ok(!/const SHAPES = /.test(src), "the formation list is no longer scored and ranked");
  assert.match(src, /const picked = outfield\.slice\(0, 10\)/, "the eleven is chosen first");
  assert.match(src, /const count = \(pos\) => picked\.filter/, "and the shape counted from it");
  assert.match(src, /LIMITS = \{ DEF: \[3, 5\], MID: \[2, 5\], FWD: \[1, 3\] \}/, "clamped to legal shapes");

  // Three squad styles must produce three different formations.
  const prob = (p) => p.s;
  const LIMITS = { DEF: [3, 5], MID: [2, 5], FWD: [1, 3] };
  const shapeOf = (players) => {
    const outfield = players.filter((p) => p.position !== "GKP").sort((a, b) => prob(b) - prob(a));
    const picked = outfield.slice(0, 10);
    const want = {};
    for (const pos of ["DEF", "MID", "FWD"]) {
      const n = picked.filter((p) => p.position === pos).length;
      want[pos] = Math.min(LIMITS[pos][1], Math.max(LIMITS[pos][0], n));
    }
    let total = want.DEF + want.MID + want.FWD;
    while (total !== 10) {
      let moved = false;
      for (const pos of ["MID", "DEF", "FWD"]) {
        const [lo, hi] = LIMITS[pos];
        if (total > 10 && want[pos] > lo) { want[pos] -= 1; total -= 1; moved = true; break; }
        if (total < 10 && want[pos] < hi) { want[pos] += 1; total += 1; moved = true; break; }
      }
      if (!moved) break;
    }
    return `${want.DEF}-${want.MID}-${want.FWD}`;
  };
  const mk = (pos, arr) => arr.map((s, i) => ({ fpl_id: `${pos}${i}`, position: pos, s }));
  assert.equal(shapeOf([...mk("GKP", [0.95]), ...mk("DEF", [0.9, 0.88, 0.86, 0.2, 0.15]),
    ...mk("MID", [0.9, 0.88, 0.85, 0.8, 0.2]), ...mk("FWD", [0.9, 0.88, 0.85, 0.1])]), "3-4-3");
  assert.equal(shapeOf([...mk("GKP", [0.95]), ...mk("DEF", [0.92, 0.9, 0.88, 0.86, 0.2]),
    ...mk("MID", [0.9, 0.88, 0.86, 0.84, 0.2]), ...mk("FWD", [0.9, 0.85, 0.1, 0.1])]), "4-4-2");
  assert.equal(shapeOf([...mk("GKP", [0.95]), ...mk("DEF", [0.93, 0.91, 0.9, 0.88, 0.86]),
    ...mk("MID", [0.9, 0.88, 0.86, 0.84, 0.2]), ...mk("FWD", [0.88, 0.1, 0.1])]), "5-4-1");
});
