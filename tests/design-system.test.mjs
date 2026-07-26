// DESIGN SYSTEM ENFORCEMENT.
//
// The type system has been abandoned twice. Convention did not hold it, so these tests do.
// Tokens live in ONE file: lib/ui.jsx. Everything else must go through the helpers exported
// from there. If a screen sets type by hand, one of these tests fails.
//
// The rules being enforced:
//   Outfit  = all words                     -> lang()
//   Michroma = page titles and wordmark only -> D, and only in lib/ui.jsx and components/Shell.jsx
//   Martian Mono = numeric values only, weight 700 maximum, never 800 -> val()
//   All ink pure #FFFFFF or a state colour. No grey, no opacity.
//   Caps only on page titles, wordmark, eyebrow labels and codes -> Label, code()
//   Plates only where a value earns emphasis, never a wall of them.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", ".git", ".next", "mockups", "tests", "docs", "legacy"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const TOKENS = "lib/ui.jsx";
const SHELL = "components/Shell.jsx";
const FILES = walk(ROOT)
  .filter((f) => /\.(jsx?|mjs)$/.test(f))
  .map((f) => ({ path: relative(ROOT, f), src: readFileSync(f, "utf8") }))
  .filter((f) => f.path.startsWith("app/") || f.path.startsWith("components/") || f.path.startsWith("lib/"));

const SURFACES = FILES.filter((f) => f.path !== TOKENS);

test("the tokens live in exactly one file", () => {
  const tokens = FILES.find((f) => f.path === TOKENS);
  assert.ok(tokens, "lib/ui.jsx must exist as the single source of type tokens");
  for (const name of ["export const FB", "export const FN", "export const D", "export const lang", "export const val", "export const code"]) {
    assert.ok(tokens.src.includes(name), `${name} must be exported from ${TOKENS}`);
  }
});

test("mono weight never exceeds 700", () => {
  for (const f of FILES) {
    assert.ok(!/fontWeight:\s*800/.test(f.src), `${f.path} sets fontWeight 800; the mono ceiling is 700`);
    assert.ok(!/fontWeight="800"/.test(f.src), `${f.path} sets fontWeight 800 as an attribute`);
  }
});

test("Michroma appears only in the tokens and the shell", () => {
  for (const f of SURFACES) {
    if (f.path === SHELL) continue;
    assert.ok(!/Michroma/.test(f.src), `${f.path} references Michroma directly; import D from lib/ui instead`);
  }
});

test("font families are never declared by hand outside the tokens", () => {
  for (const f of SURFACES) {
    const hand = f.src.match(/fontFamily:\s*["'](?!.*\$\{)/g) || [];
    assert.equal(hand.length, 0, `${f.path} declares fontFamily by hand ${hand.length} time(s); use lang, val or code`);
  }
});

test("text ink is never grey or translucent", () => {
  // colour: with an rgba/hsla value, or a grey hex, means hierarchy is being faked with opacity.
  for (const f of SURFACES) {
    const bad = [
      ...(f.src.match(/(?<!background)(?<!Color)color:\s*["'](rgba|hsla)/gi) || []),
      // the expression form, e.g. color={cond ? T.green : "rgba(255,255,255,0.6)"}
      ...(f.src.match(/color=\{[^}]*["'](rgba|hsla)\(/gi) || []),
    ];
    assert.equal(bad.length, 0, `${f.path} uses translucent ink ${bad.length} time(s); hierarchy comes from size and weight`);
    const grey = f.src.match(/color:\s*["']#(?:[89ab]{6}|[cdef]{3}(?!f)|999|aaa|bbb|ccc|ddd|eee)["']/gi) || [];
    assert.equal(grey.length, 0, `${f.path} uses grey ink ${grey.length} time(s)`);
  }
});

test("uppercasing goes through code or Label, never ad hoc", () => {
  const ALLOWED = new Set([TOKENS, SHELL]);
  for (const f of SURFACES) {
    if (ALLOWED.has(f.path)) continue;
    const bad = f.src.match(/textTransform:\s*["']uppercase["']/g) || [];
    assert.equal(bad.length, 0, `${f.path} sets textTransform uppercase ${bad.length} time(s); use code() or Label`);
  }
});

test("no data surface becomes a wall of plates", () => {
  // A row of plated cells is what the type system exists to prevent. Four in one file is the
  // ceiling: enough for genuine emphasis, not enough to plate every column of a table.
  const LIMIT = 4;
  for (const f of SURFACES) {
    const plates = f.src.match(/<Plate[\s>]/g) || [];
    assert.ok(plates.length <= LIMIT, `${f.path} renders ${plates.length} plates; the ceiling is ${LIMIT}. Use Value for ordinary numeric cells`);
  }
});

test("no abbreviation is shipped that a reader cannot decode", () => {
  // Codes are permitted (club abbreviations, positions, GW numbers, FIT/DOUBT/OUT). Invented
  // shorthand is not. This list grows whenever one is found in review.
  const BANNED = ["TPL", "EP ", ">EP<", "XP90", "PPM", "EO%"];
  for (const f of SURFACES) {
    for (const b of BANNED) {
      assert.ok(!f.src.includes(`>${b.trim()}<`), `${f.path} renders the undecodable label ${b.trim()}`);
    }
  }
});

test("xP is the only term for projected points", () => {
  for (const f of SURFACES) {
    assert.ok(!/\bEP\b/.test(f.src.replace(/EPL/g, "")), `${f.path} uses EP; the locked term is xP`);
  }
});

test("the decisions document exists and is the binding reference", () => {
  const doc = readFileSync(join(ROOT, "docs/DECISIONS.md"), "utf8");
  assert.ok(doc.includes("This document is binding"), "DECISIONS.md must state that it is binding");
  // Every section that carries decisions must survive future edits.
  for (const heading of [
    "## 1. Type system", "## 2. Numbers and honesty", "## 3. Filters and player discovery",
    "## 4. Player pages", "## 5. Opponent context", "## 6. Builder and drafts",
    "## 7. Scoring panel", "## 8. Pages that do not exist", "## 9. The model",
    "## 10. Quality bar for every delivery", "## 11. Working rules",
  ]) {
    assert.ok(doc.includes(heading), `DECISIONS.md is missing ${heading}`);
  }
});

test("no affordability filter hides players anywhere", () => {
  // Decision 3.2: all players stay visible regardless of budget.
  for (const f of SURFACES) {
    if (!f.path.startsWith("app/players")) continue;
    assert.ok(!/price\s*<=\s*budget/i.test(f.src), `${f.path} filters players by affordability`);
    assert.ok(!/canAfford/i.test(f.src), `${f.path} filters players by affordability`);
  }
});

test("no date literal appears outside config/schedule.js", () => {
  // The four project deadlines were retyped wrong repeatedly because they lived in prose in five
  // documents. They now live in one module. This test fails the build if one is written by hand.
  const MONTHS = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
  const pattern = new RegExp(`\\b\\d{1,2}\\s?(${MONTHS})\\b`, "i");
  const longform = /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
  for (const f of SURFACES) {
    if (f.path === "config/schedule.js") continue;
    const lines = f.src.split("\n");
    lines.forEach((line, i) => {
      // comments may cite a date as provenance; rendered strings and constants may not
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      if (isComment) return;
      assert.ok(!pattern.test(line) && !longform.test(line),
        `${f.path}:${i + 1} hard-codes a date. Read it from config/schedule.js instead: ${line.trim().slice(0, 70)}`);
    });
  }
});

test("no job imports JSON directly", () => {
  // Jobs run under plain node in GitHub Actions, where a bare JSON import throws
  // ERR_IMPORT_ATTRIBUTE_MISSING. They must read the file instead. This has broken twice.
  const jobs = walk(join(ROOT, "jobs")).filter((f) => /\.mjs$/.test(f));
  for (const f of jobs) {
    const src = readFileSync(f, "utf8");
    const bad = src.match(/^\s*import\s+[^;]*from\s+["'][^"']+\.json["']/gm) || [];
    assert.equal(bad.length, 0,
      `${relative(ROOT, f)} imports JSON directly. Use readFileSync with a URL relative to import.meta.url instead.`);
  }
});
