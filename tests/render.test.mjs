// RENDER CHECKS for every route.
//
// Six faults sat live in the UI while 309 tests passed: a NaN in the nav, a blank Line-ups pitch, a player
// list that only appeared after a click, a build button that refused with no locks set, "Pick GK" on a
// read-only pitch, and a countdown with no number. Every one of them was invisible to a suite that reads
// code, because the code was structurally fine and only wrong once it ran.
//
// These are the static equivalents of what the browser pass caught. They cannot replace loading the site,
// and they are not meant to: they exist so that these specific faults cannot come back silently.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");

const ROUTES = [
  ["Dashboard", "app/page.jsx"],
  ["Builder", "app/builder/BuilderClient.jsx"],
  ["Squad", "app/squad/SquadClient.jsx"],
  ["Players", "app/players/page.jsx"],
  ["Line-ups", "app/lineups/LineupsClient.jsx"],
  ["News", "app/news/NewsClient.jsx"],
  ["Status", "app/status/page.jsx"],
  ["Player detail", "app/player/[id]/PlayerPage.jsx"],
];

test("every route exists and renders a component", () => {
  const missing = ROUTES.filter(([, f]) => !existsSync(f)).map(([n]) => n);
  assert.deepEqual(missing, [], `routes with no component: ${missing.join(", ")}`);
  for (const [name, f] of ROUTES) {
    assert.match(read(f), /export default function/, `${name} must export a component`);
  }
});

test("no number reaches the screen without a guard against NaN", () => {
  // "UPDATED NANH AGO" shipped because a missing timestamp went straight into arithmetic. Any figure built
  // from a date or a division has to prove it is finite first.
  const shell = read("components/Shell.jsx");
  assert.match(shell, /Number\.isFinite\(then\)/, "the freshness clock must check its timestamp");
  assert.match(shell, /Number\.isFinite\(mins\)/, "and the figure it derives");

  const page = read("app/page.jsx");
  assert.match(page, /\{dl \? \(/, "the countdown must not draw an empty number when no deadline exists");
});

test("nothing a page needs is imported in a way the browser cannot resolve", () => {
  // `import x from "y.json" with { type: "json" }` is required by Node and rejected by webpack, so the
  // Line-ups data was undefined in the browser while every Node test passed and the pitch drew nothing.
  for (const f of ["lib/lineups.mjs", "lib/projections.js", "lib/data.js", "lib/ui.jsx"]) {
    assert.ok(!/with \{ type: "json" \}/.test(read(f)),
      `${f} uses an import assertion, which webpack rejects and Node requires`);
  }
  // The library must not reach for the file itself; callers pass the data in.
  assert.ok(!/from "\.\.\/config\/lineups\.json"/.test(read("lib/lineups.mjs")),
    "lib/lineups.mjs must take the clubs as an argument, so it works in both environments");
});

test("the Builder shows players without needing a click first", () => {
  // The list only rendered once an empty slot was selected, so a new draft showed a heading over blank
  // space and there was nothing to pick from.
  const src = read("app/builder/BuilderClient.jsx");
  assert.ok(!/\{slotPos \? \(/.test(src), "the list must not be hidden behind a slot selection");
  assert.match(src, /<Candidates pos=\{replacing \? replacing\.position : \(slotPos \|\| "ANY"\)\}/,
    "with no slot chosen it shows every position");
});

test("an unknown start probability never blocks the build", () => {
  const src = read("lib/solver/autobuild.mjs");
  assert.match(src, /if \(probability === null \|\| probability === undefined\) return true;/,
    "unknown must mean unknown, not disqualified");
  assert.match(src, /return Number\(probability\) >= minStart;/,
    "only a known probability below the threshold may block a starter");
});

test("a read-only pitch does not tell you to do something you cannot", () => {
  const pitch = read("components/BuilderPitch.jsx");
  assert.match(pitch, /function EmptySlot\(\{ pos, onClick, active, readOnly \}\)/,
    "the empty slot must know whether the pitch is read-only");
  assert.match(pitch, /readOnly \? \(pos === "GKP" \? "GK" : pos\)/, "and drop the verb when it is");
  assert.match(read("app/squad/SquadClient.jsx"), /readOnly=\{readOnly\}/, "Squad must pass it through");
});

test("every pitch in the product is the same pitch", () => {
  // Line-ups drew a plain gradient with no markings while the Builder had stripes, a centre circle and a
  // penalty box, so two screens showing the same kind of thing looked unrelated.
  const surface = read("components/PitchSurface.jsx");
  assert.match(surface, /export const GRASS/, "one grass");
  assert.match(surface, /export function PitchMarkings/, "one set of markings");
  assert.match(read("app/lineups/LineupsClient.jsx"), /<PitchSurface/, "Line-ups uses it");
});

test("no page renders a heading with nothing underneath", () => {
  // Every empty state must say something. A heading over blank space reads as broken.
  const checks = [
    ["app/news/NewsClient.jsx", /empty=\{/],
    ["app/lineups/LineupsClient.jsx", /Not in the player list yet/],
    ["app/squad/SquadClient.jsx", /Read-only\. Syncs from the official API/],
  ];
  const bad = checks.filter(([f, re]) => !re.test(read(f))).map(([f]) => f);
  assert.deepEqual(bad, [], `these have an empty state with no words: ${bad.join(", ")}`);
});

test("the pitch uses the active captain multiplier and nowhere else", () => {
  // The armband was drawn but the number was not doubled, so a captain read the same as anyone. It doubles
  // where the squad is shown, and not in the player list or the modal, because those describe the player
  // rather than this squad, and not on Line-ups, which has no captain.
  const pitch = read("components/BuilderPitch.jsx");
  assert.match(pitch, /Number\(metric\) \* \(isCaptain \? captainMultiplier : 1\)/,
    "the pitch uses the same multiplier as the shared chip calculator");
  assert.match(pitch, /captainMultiplier = 2/, "ordinary captaincy still defaults to double");

  for (const f of ["components/Candidates.jsx", "app/players/page.jsx", "app/lineups/LineupsClient.jsx"]) {
    assert.ok(!/isCaptain \? 2/.test(read(f)), `${f} must not double: it is not showing a squad`);
  }
});

test("every empty slot can be clicked, bench included", () => {
  // The bench placeholders were plain spans, so clicking one did nothing at all.
  const pitch = read("components/BuilderPitch.jsx");
  const bench = pitch.slice(pitch.indexOf("Which positions the bench still needs"));
  assert.match(bench, /<button key=\{`be-\$\{i\}`\}/, "an empty bench slot must be a button");
  assert.match(bench, /onSlotClick\(pos\)/, "and tell the page which position to filter to");
  assert.match(bench, /RULES\.composition\[pos\]/, "labelled with the position still needed");
});

test("the Builder has one build button and no stray second action", () => {
  const src = read("app/builder/BuilderClient.jsx");
  assert.ok(!/START AGAIN/.test(src), "START AGAIN was removed");
  /* The label used to change between BUILD SQUAD, FILL GAPS and IMPROVE depending on how many players
     were on the pitch, which meant the same button described three different-sounding jobs. It is one
     action with one name, and it states the gameweeks it is solving for. */
  assert.match(src, /BUILD BEST SQUAD · \{rangeLabel\}/, "one button that says what it will do");
  assert.ok(!/"FILL GAPS"|"IMPROVE"/.test(src), "the shifting labels are gone");
});

test("external xPTS mode does not reload or double-count internal penalty duty", () => {
  const projections = read("lib/projections.js");
  const external = read("lib/external_xpts.mjs");
  assert.doesNotMatch(projections, /set_piece_duty/, "external mode must not load internal set-piece rows");
  assert.match(external, /raw_imported_xpts/, "the imported source stays auditable");
  assert.match(external, /zeroed-not-predicted-lineup/, "the predicted-line-up gate is explicit");
});
