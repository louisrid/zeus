// Guard tests. These enforce the binding rules across the whole repo rather than one module,
// so a future session cannot quietly break them.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", ".git", ".next", "mockups", "tests", "docs"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const FILES = walk(ROOT).filter((f) => /\.(js|jsx|mjs)$/.test(f));
const read = (f) => readFileSync(f, "utf8");
const rel = (f) => f.replace(ROOT, "");

test("the repo has code to check", () => {
  assert.ok(FILES.length > 20, `only found ${FILES.length} files`);
});

/* ── zero AI calls outside the one permitted job ──────────────────────── */

test("only the presser job reaches an AI provider", () => {
  // The in-app Analyst was built on 26 Jul and removed the same evening at Louis's instruction. The
  // Copy payload button is the accepted mechanism. This guard holds the line.
  const offenders = [];
  for (const f of FILES) {
    if (!/openrouter\.ai|api\.anthropic|api\.openai/.test(read(f))) continue;
    const ok = /jobs\/presser_pull\.mjs$/.test(f);
    if (!ok) offenders.push(rel(f));
  }
  assert.deepEqual(offenders, [], `AI provider reached outside the two allowed places: ${offenders.join(", ")}`);
});

test("no client component or model code imports an AI client", () => {
  const offenders = [];
  for (const f of FILES) {
    if (!/["']use client["']|\/lib\/engine\/|\/lib\/solver\//.test(f) && !/use client/.test(read(f).slice(0, 40))) continue;
    if (/openrouter\.ai|OPENROUTER_API_KEY/.test(read(f))) offenders.push(rel(f));
  }
  assert.deepEqual(offenders, [], `AI reachable from the browser or the model: ${offenders.join(", ")}`);
});

/* ── no scoring constant outside the ruleset ──────────────────────────── */

test("the engine reads scoring values only through the ruleset", () => {
  const scoped = FILES.filter((f) => /\/lib\/engine\//.test(f) && !/config\.mjs$/.test(f));
  for (const f of scoped) {
    const src = read(f);
    // Anything that looks like a scoring literal being assigned to a scoring-shaped name.
    const bad = src.match(/\b(cleanSheet|clean_sheet|goalPoints|assistPoints|bonusPoints|hitCost|budget)\s*=\s*-?\d/i);
    assert.equal(bad, null, `${rel(f)} hard-codes ${bad && bad[0]}`);
  }
});

test("the solver core takes its limits as a parameter rather than declaring them", () => {
  const src = read(join(ROOT, "lib/solver/core.mjs"));
  assert.equal(/^\s*import .*rules-2026-27\.json/m.test(src), false, "core must not import the ruleset directly");
  assert.match(src, /export function limitsFrom/);
  // No squad limit may be assigned a literal: every one must come off R.
  for (const name of ["budget", "maxPerClub", "size", "startingXI", "hitCost"]) {
    const bad = new RegExp(`\\b${name}\\s*[:=]\\s*-?\\d`);
    assert.equal(bad.test(src), false, `core assigns a literal to ${name}`);
    assert.ok(src.includes(`R.${name}`), `core should read R.${name}`);
  }
});

/* ── the xP gate ──────────────────────────────────────────────────────── */

test("xP is the label everywhere and comes only from metricName", () => {
  // Louis set this on 26 Jul 2026, superseding the earlier gate that withheld the name. The rule now
  // is the opposite: xP is always the label, and no screen may write it by hand.
  const ui = FILES.filter((f) => /\/(app|components)\//.test(f) && !/legacy/.test(f));
  const offenders = [];
  for (const f of ui) {
    if (/"xP"|'xP'|>xP</.test(read(f))) offenders.push(rel(f));
  }
  assert.deepEqual(offenders, [], `xP written directly instead of via metricName in: ${offenders.join(", ")}`);
});

test("nothing is labelled provisional to the user", () => {
  // The INTERIM wording is gone by decision. interimChip is a no-op and metricLabel never hedges.
  const src = read(join(ROOT, "lib/solver/score.mjs"));
  assert.match(src, /export const metricName = \(\) => "xP";/);
  assert.doesNotMatch(src, /INTERIM SCORE/);
  const ui = FILES.filter((f) => /\/(app|components)\//.test(f) && !/legacy/.test(f));
  for (const f of ui) {
    assert.doesNotMatch(read(f), /INTERIM SCORE|UPGRADES \d/,
      `${rel(f)} still shows provisional wording to the user`);
  }
});

test("the gate ships closed in both the config and the migration", () => {
  const engineJson = JSON.parse(read(join(ROOT, "config/engine-2026-27.json")));
  assert.equal(engineJson.gates.xp_visible.value, false);
  const sql = read(join(ROOT, "supabase/migration-004.sql"));
  assert.match(sql, /insert into model_gates[\s\S]*'xp_visible', false/);
});

/* ── secrets and the security posture ─────────────────────────────────── */

test("no key-shaped string is committed", () => {
  const patterns = [/eyJ[A-Za-z0-9_-]{30,}/, /sk-[A-Za-z0-9]{20,}/, /sk-or-v1-[A-Za-z0-9]{10,}/, /service_role.{0,20}eyJ/];
  for (const f of FILES.concat(walk(ROOT).filter((x) => /\.(sql|json|ya?ml)$/.test(x)))) {
    const src = read(f);
    for (const p of patterns) {
      assert.equal(p.test(src), false, `${rel(f)} looks like it contains a credential`);
    }
  }
});

test("the browser never holds the service key", () => {
  const client = FILES.filter((f) => /\/(components|lib)\//.test(f) || /\/app\/(?!api).*\.jsx?$/.test(f));
  for (const f of client) {
    const src = read(f);
    assert.equal(src.includes("SUPABASE_SERVICE_KEY"), false, `${rel(f)} references the service key`);
  }
});

test("the service key is only read in jobs and server routes", () => {
  const users = FILES.filter((f) => read(f).includes("SUPABASE_SERVICE_KEY")).map(rel);
  for (const u of users) {
    assert.ok(/^(jobs|app\/api)\//.test(u), `${u} should not read the service key`);
  }
  assert.ok(users.includes("app/api/drafts/route.js"), "the drafts route is the only write path");
  assert.ok(users.some((u) => u === "jobs/projections_run.mjs"));
});

test("nothing automates an FPL login or persists a session", () => {
  for (const f of FILES) {
    const src = read(f).toLowerCase();
    assert.equal(/users\/fpl\/login|fpl.*password|document\.cookie\s*=/.test(src), false, `${rel(f)} touches credentials`);
  }
});

/* ── writes go through server routes ─────────────────────────────────── */

test("client code never writes to the database", () => {
  const client = FILES.filter((f) => /\/(components)\//.test(f) || /\/app\/(?!api).*Client\.jsx$/.test(f) || /\/lib\/(data|projections)\.js$/.test(f));
  assert.ok(client.length >= 4);
  for (const f of client) {
    const src = read(f);
    for (const op of [".insert(", ".upsert(", ".delete(", ".update("]) {
      assert.equal(src.includes(op), false, `${rel(f)} performs a ${op} from the browser`);
    }
  }
});

/* ── protected features from Packages 1 and 2 ─────────────────────────── */

test("the Package 1 and 2 surfaces are all still present", () => {
  const must = [
    "app/page.jsx", "app/players/page.jsx", "app/status/page.jsx", "app/news/page.jsx",
    "app/analysis/page.jsx", "app/legacy/page.jsx", "app/legacy/dashboard/page.jsx", "app/legacy/players/page.jsx",
    "components/Shell.jsx", "components/Pitch.jsx", "components/Splash.jsx", "components/Stub.jsx",
    "lib/ui.jsx", "lib/data.js", "lib/bps_engine.mjs", "lib/supabase.js",
    "jobs/fpl_bootstrap.mjs", "jobs/odds_pull.mjs", "jobs/understat_pull.mjs", "jobs/archive_2526.mjs", "jobs/bps_backtest.mjs",
    "supabase/schema.sql", "supabase/migration-002.sql", "supabase/migration-003.sql",
    "config/rules-2026-27.json", "docs/tickets.md", "STATUS.md", "README.md",
  ];
  for (const m of must) {
    assert.doesNotThrow(() => statSync(join(ROOT, m)), `${m} is missing`);
  }
});

test("the design system is unchanged", () => {
  const ui = read(join(ROOT, "lib/ui.jsx"));
  assert.match(ui, /Michroma/);
  assert.match(ui, /Martian Mono/);
  assert.match(ui, /Outfit/);
  assert.match(ui, /green: "#00FF85"/);
  assert.match(ui, /tag: "#FF2ECC"/);
  assert.match(ui, /pink: "#E90052"/);
  const css = read(join(ROOT, "app/globals.css"));
  assert.match(css, /Michroma/);
});

test("no new surface introduces a fourth font or an amber accent", () => {
  const ui = FILES.filter((f) => /\/(components|app)\//.test(f) && /\.jsx$/.test(f));
  for (const f of ui) {
    const src = read(f);
    const fonts = src.match(/fontFamily:\s*"'([^']+)'/g) || [];
    for (const decl of fonts) {
      assert.ok(/Outfit|Martian Mono|Michroma/.test(decl), `${rel(f)} uses ${decl}`);
    }
    assert.equal(/#FFB454|amber/i.test(src), false, `${rel(f)} introduces an amber accent`);
  }
});

test("the navigation rail stays on the right and the goalkeeper stays at the bottom", () => {
  assert.match(read(join(ROOT, "components/Shell.jsx")), /row-reverse/);
  for (const f of ["components/Pitch.jsx", "components/BuilderPitch.jsx"]) {
    const src = read(join(ROOT, f));
    const order = src.match(/\["FWD",\s*"MID",\s*"DEF",\s*"GKP"\]/);
    assert.ok(order, `${f} must render forwards first and goalkeeper last`);
  }
});

test("no font renders below twelve pixels", () => {
  const ui = FILES.filter((f) => /\/(components|app)\//.test(f) && /\.jsx$/.test(f));
  for (const f of ui) {
    for (const m of read(f).matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      assert.ok(Number(m[1]) >= 12, `${rel(f)} renders at ${m[1]}px`);
    }
    for (const m of read(f).matchAll(/\b(?:lang|val|code)\((\d+(?:\.\d+)?)/g)) {
      assert.ok(Number(m[1]) >= 11.5, `${rel(f)} renders at ${m[1]}px`);
    }
  }
});

test("no developer-style label reaches the interface", () => {
  const ui = FILES.filter((f) => /\/(components|app)\//.test(f) && /\.jsx$/.test(f));
  const banned = [/>ep_mean</, /p_start<[^)]/, /model_version/, /null<\//, /undefined<\//, /TODO/, /FIXME/];
  for (const f of ui) {
    const src = read(f);
    for (const b of banned) assert.equal(b.test(src), false, `${rel(f)} shows ${b}`);
  }
});
