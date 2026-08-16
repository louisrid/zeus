// Every API route must import what it uses.
//
// This exists because a source-text test passed while the live endpoint returned a 500. The bench-spend
// check asserted that the string DEFAULT_MINIMUM_BENCH_SPEND appeared in the route, which it did, while
// the import that defines it was missing. Reading a file proves nothing about whether it runs. These
// tests import every route module for real, which is the only thing that catches a missing import.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

function routeFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, found);
    else if (entry === "route.js" || entry === "route.mjs") found.push(full);
  }
  return found;
}

const ROUTES = routeFiles("app/api");

test("every API route module imports cleanly", async () => {
  assert.ok(ROUTES.length >= 10, `expected the full route set, found ${ROUTES.length}`);
  const broken = [];
  for (const file of ROUTES) {
    try {
      await import(new URL(`../${file}`, import.meta.url).href);
    } catch (error) {
      broken.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(broken, [], `these routes would 500 at runtime:\n${broken.join("\n")}`);
});

test("no route uses an identifier it never imported or defined", () => {
  // A narrow, deliberate check on shared constants: the ones most likely to be pasted into a route
  // without the accompanying import, which is exactly what happened.
  const SHARED = {
    DEFAULT_MINIMUM_BENCH_SPEND: "lib/minimum-bench-spend.mjs",
    parseMinimumBenchSpend: "lib/minimum-bench-spend.mjs",
    parseExcludedPlayerIds: "lib/excluded-player-ids.mjs",
  };
  const problems = [];
  for (const file of ROUTES) {
    const src = readFileSync(file, "utf8");
    for (const [name, from] of Object.entries(SHARED)) {
      const used = new RegExp(`\\b${name}\\b`).test(src);
      if (!used) continue;
      const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from[^;]*minimum-bench-spend|` +
                                 `import[^;]*\\b${name}\\b[^;]*from[^;]*excluded-player-ids`).test(src);
      const defined = new RegExp(`(const|let|function)\\s+${name}\\b`).test(src);
      if (!imported && !defined) problems.push(`${file} uses ${name} without importing it from ${from}`);
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
