// Guard tests. These enforce the binding rules across the whole repo rather than one module,
// so a future session cannot quietly break them.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { PRIMARY_ROUTES, routeTitleMap } from "../lib/routes.mjs";

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
  assert.match(src, /export const metricName = \(\) => "xPTS";/);
  assert.doesNotMatch(src, /INTERIM SCORE/);
  const ui = FILES.filter((f) => /\/(app|components)\//.test(f) && !/legacy/.test(f));
  for (const f of ui) {
    assert.doesNotMatch(read(f), /INTERIM SCORE|UPGRADES \d/,
      `${rel(f)} still shows provisional wording to the user`);
  }
});

test("the gate ships closed in both the config and the migration", () => {
  const engineJson = JSON.parse(read(join(ROOT, "config/engine-2026-27.json")));
  // Open since 29 Jul 2026: the fallback was measured and its structure, not its tuning, was the limit.
  assert.equal(engineJson.gates.xp_visible.value, true);
  const sql = read(join(ROOT, "supabase/migration-004.sql"));
  // Migration 004 still creates it shut, which is correct: a fresh database should not trust an unmeasured
  // engine. Migration 025 opens it, and that is where the reasoning lives.
  assert.match(sql, /insert into model_gates[\s\S]*'xp_visible', false/);
  const opener = read(join(ROOT, "supabase", "migration-025.sql"));
  assert.match(opener, /set passed = true/, "migration 025 must open the gate");
  assert.match(opener, /beat "?just use the player's own average"? by three per cent|by three per cent/,
    "and record why, so nobody reopens this argument from scratch");
});

/* ── secrets and the security posture ─────────────────────────────────── */

function sourceForCredentialScan(file) {
  const source = read(file);
  if (!/\.ya?ml$/i.test(String(file))) return source;
  return source.replace(
    /(<<['"]?ZEUS_PAYLOAD['"]?\s*\n)[\s\S]*?(\n\s*ZEUS_PAYLOAD\s*(?:\n|$))/g,
    "$1[embedded ZEUS deployment payload omitted from credential-shape scan]$2",
  );
}

test("no key-shaped string is committed", () => {
  const patterns = [/eyJ[A-Za-z0-9_-]{30,}/, /sk-[A-Za-z0-9]{20,}/, /sk-or-v1-[A-Za-z0-9]{10,}/, /service_role.{0,20}eyJ/];
  for (const f of FILES.concat(walk(ROOT).filter((x) => /\.(sql|json|ya?ml)$/.test(x)))) {
    const src = sourceForCredentialScan(f);
    for (const p of patterns) {
      assert.equal(p.test(src), false, `${rel(f)} looks like it contains a credential`);
    }
  }
});

test("the browser never holds the service key", () => {
  /* lib/server is excluded because it only ever runs in a route handler, which the import test below
     enforces. Everything else under components, lib and app outside api can end up in a bundle. */
  const client = FILES.filter((f) => (/\/(components|lib)\//.test(f) || /\/app\/(?!api).*\.jsx?$/.test(f))
    && !/\/lib\/server\//.test(f));
  for (const f of client) {
    const src = read(f);
    assert.equal(src.includes("SUPABASE_SERVICE_KEY"), false, `${rel(f)} references the service key`);
  }
});

test("the service key is only read where it can never reach a browser", () => {
  /* jobs and route handlers run on a server. lib/server exists for the same reason and is named for it, so
     it is allowed too, but only because the test below proves nothing client-side imports from it. Widening
     the rule without that second check would be how a key leaks. */
  const users = FILES.filter((f) => read(f).includes("SUPABASE_SERVICE_KEY")).map(rel);
  for (const u of users) {
    assert.ok(/^(jobs|app\/api|lib\/server)\//.test(u), `${u} should not read the service key`);
  }
  assert.ok(users.includes("app/api/drafts/route.js"), "the drafts route is the only write path");
  assert.ok(users.some((u) => u === "jobs/projections_run.mjs"));
});

test("nothing that runs in a browser imports from lib/server", () => {
  /* This is what makes the rule above safe. A client component importing lib/server would pull the service
     key into the bundle. Only route handlers and other server modules may touch it. */
  const offenders = [];
  for (const f of FILES) {
    const src = read(f);
    if (!/from "[^"]*lib\/server\//.test(src) && !/from "\.\.\/server\//.test(src)) continue;
    const path = rel(f);
    const isClient = /^\s*["']use client["'];/m.test(src);
    const isServer = /^(jobs|app\/api|lib\/server)\//.test(path)
      || (path.startsWith("app/") && !isClient);
    if (!isServer || isClient) offenders.push(`${path} imports lib/server and may run in a browser`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
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

test("every live surface is still present", () => {
  // This list used to require app/legacy, an old duplicate UI reachable in the deployed app. Louis has
  // no terminal, so it cannot be deleted by a zip: it is overwritten with a redirect instead, and the
  // retirement test below is what keeps it dead. This list is the surfaces that actually ship.
  const must = [
    "app/page.jsx", "app/players/page.jsx", "app/status/page.jsx", "app/news/page.jsx",
    "app/analysis/page.jsx", "app/builder/page.jsx", "app/squad/page.jsx",
    // Stub.jsx was on this list and on tidy's deletion list at the same time, so tidy deleted it, this test
    // failed, and the whole cleanup aborted. Nothing imports it, so it is not a live surface.
    "components/Shell.jsx", "components/Pitch.jsx", "components/Splash.jsx",
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
  /* The neon pink is now a neon light blue, on Louis's instruction. Two tones: #4FD8FF for numbers on a
     dark ground, #3ECBFF for badges that carry text, which take dark text because white would not read on
     it. The FPL risk pink stays, because it means risk rather than emphasis. */
  assert.match(ui, /xp: "#4FD8FF"/);
  assert.match(ui, /tag: "#3ECBFF"/);
  assert.match(ui, /onTag: "#04202B"/);
  assert.match(ui, /pink: "#E90052"/);
  assert.ok(!/#FF2ECC|#FF3FA4/.test(ui), "no neon pink left in the tokens");
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


test("every bare identifier called in a client component resolves to an import or a local definition", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  // Two toolbar buttons shipped dead because buildPayload and bestXI were called but never imported:
  // the build passes, the click throws, the user sees a button that does nothing.
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) { if (!/legacy|node_modules/.test(f.name)) walk(`${d}/${f.name}`); }
    else if (f.name.endsWith(".jsx")) files.push(`${d}/${f.name}`);
  } };
  walk("app"); walk("components");
  const offenders = [];
  for (const f of files) {
    // Comments are prose: a sentence like "THE SQUAD SCREEN." should not read as a reference to an
    // object called SQUAD. Strip them before scanning.
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const called = [
      // Functions called, and objects used via a property access. The second half was missing, so
      // `RULES.composition` in an extracted component was undefined at runtime and crashed the page.
      ...[...src.matchAll(/(?<![.\w])([a-z][A-Za-z0-9]+)\(/g)].map((m) => m[1]),
      // Property access by dot OR by bracket. Only the dot form was checked, so POS_ORDER[pos] in an
      // extracted component was undefined at runtime and crashed the page.
      // Every way a module constant actually gets used: dot access, bracket access, and iteration.
      // POS_ORDER was used only as `for (const x of POS_ORDER)`, which the first two forms miss.
      ...[...src.matchAll(/(?<![.\w$])([A-Z][A-Z_0-9]{2,})\s*[.[]/g)].map((m) => m[1]),
      ...[...src.matchAll(/\b(?:of|in)\s+([A-Z][A-Z_0-9]{2,})\b/g)].map((m) => m[1]),
      // Lower-case identifiers used via a property access. `partners.length` survived a refactor and
      // crashed the Squad player menu; it was invisible here because the name was never CALLED.
      ...[...src.matchAll(/(?<![.\w$'"`])([a-z][a-zA-Z0-9]{2,})\.(?:length|map|filter|find|includes|some|every|slice|join|forEach|reduce|toFixed|web_name|fpl_id|position|price|players|structure|captain|vice|starting)\b/g)].map((m) => m[1]),
    ];
    const clean = (n) => String(n).replace(/^[({[\s]+/, "").replace(/[)}\]\s]+$/, "");
    const declared = new Set([
      ...[...src.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(" as ").pop())),
      ...[...src.matchAll(/\(\s*\[([^\]]+)\]/g)].flatMap((m) => m[1].split(",").map((x) => x.trim())),
      ...[...src.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/[=:]/)[0].trim())),
      // Arrow-function parameters, single and multiple, which is how most callbacks name their argument.
      ...[...src.matchAll(/\(([^)]{0,120}?)\)\s*=>/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/[=:]/)[0].trim())),
      ...[...src.matchAll(/(?:^|[^\w$])([a-zA-Z_$][\w$]*)\s*=>/gm)].map((m) => m[1]),
      ...[...src.matchAll(/import\s+(\w+)\s+from/g)].map((m) => m[1]),
      ...[...src.matchAll(/(?:const|let|var|function)\s+(\w+)/g)].map((m) => m[1]),
      // Multi-declarator statements: `const out = x, inn = y` declares both names.
      ...[...src.matchAll(/(?:const|let|var)\s+([^;\n]*=[^;\n]*)/g)].flatMap((m) =>
        m[1].split(",").map((part) => (part.split("=")[0] || "").trim())),
      // A name captured from a nested call can carry a stray opening bracket.
      ...[...src.matchAll(/(?:const|let|var)\s*\[([^\]]+)\]/g)].flatMap((m) => m[1].split(',').map((x) => x.trim())),
      ...[...src.matchAll(/(\w+)\s*[,}]?\s*=?\s*\}\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\(\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/[=:]/)[0].trim())),
    ].map(clean).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)));
    const GLOBALS = new Set(["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "alert",
      "parseFloat", "parseInt", "isNaN", "structuredClone", "encodeURIComponent", "decodeURIComponent", "require", "translateX", "translateY", "translateZ", "rgba", "minmax", "repeat", "calc", "url", "gradient",
      /* env() is CSS, not JavaScript, and sits alongside calc and minmax above for the same reason: it
         appears inside a style string. It is how a layout reads the safe-area insets on a notched phone,
         which is what keeps the bottom navigation clear of the home indicator. */
      "env", "apply", "import", "min", "max", "clamp", "JSON", "Math", "Object", "Array", "Number", "String", "Boolean", "Map", "Set", "Date", "Promise", "URLSearchParams", "RegExp", "window", "document", "sessionStorage", "localStorage", "navigator", "console", "process", "React",
      // Appears only inside user-facing prose such as "No picks exist before GW1."
      "GW1"]);
    for (const name of new Set(called)) {
      if (declared.has(name) || GLOBALS.has(name)) continue;
      offenders.push(`${f}: ${name}() is called but never imported or defined`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("every option passed to bestXI is an option bestXI actually accepts", async () => {
  // The Ignore feature did nothing for a whole delivery because the caller passed `ignores` while the
  // solver destructured `ignore`. No error, no warning, silently empty. Object-property typos are
  // invisible to the identifier guard above, so call sites are checked against the signature directly.
  const { readFileSync } = await import("node:fs");
  const solver = readFileSync("lib/solver/autobuild.mjs", "utf8");
  const sig = solver.match(/export function bestXI\(\{([^}]*)\}/);
  assert.ok(sig, "bestXI must take a destructured options object");
  const accepted = new Set(sig[1].split(",").map((x) => x.trim().split(/[=:]/)[0].trim()).filter(Boolean));

  const caller = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const offenders = [];
  for (const call of caller.matchAll(/bestXI\(\{([^}]*)\}\)/g)) {
    for (const part of call[1].split(",")) {
      const name = part.trim().split(":")[0].trim();
      if (!name) continue;
      if (!accepted.has(name)) offenders.push(`bestXI called with "${name}", which it does not accept`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});


test("retired files stay retired", async () => {
  // A zip can overwrite but never delete, so every file removed from the project lives on as an inert
  // stub. Without this test a stub could be quietly overwritten by an older copy and come back to life.
  const { readFileSync, existsSync } = await import("node:fs");
  const retired = [
    "app/api/analyst/route.js", "components/AskAnalyst.jsx", "lib/harness.mjs",
    "jobs/projection_run.mjs", "app/legacy/page.jsx", "app/legacy/dashboard/page.jsx",
    "app/legacy/players/page.jsx", "supabase/migration-019.sql",
  ];
  for (const f of retired) {
    if (!existsSync(f)) continue;   // deleted for real at some point, which is better still
    const src = readFileSync(f, "utf8");
    assert.match(src, /RETIRED/, `${f} exists but no longer declares itself retired, so it may have been resurrected`);
  }
  // And the legacy routes must not render an interface.
  for (const f of ["app/legacy/page.jsx", "app/legacy/dashboard/page.jsx", "app/legacy/players/page.jsx"]) {
    if (!existsSync(f)) continue;
    assert.match(readFileSync(f, "utf8"), /redirect\("\/"\)/, `${f} must redirect, not render`);
  }
});

test("no component imports a name it never uses", async () => {
  // Twenty-six dead imports had accumulated. Each one is a signal that something was half-removed, and
  // they hide real breakage: an import that survives a deletion looks like the feature still exists.
  const { readFileSync, readdirSync } = await import("node:fs");
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) { if (!/legacy|node_modules/.test(f.name)) walk(`${d}/${f.name}`); }
    else if (f.name.endsWith(".jsx")) files.push(`${d}/${f.name}`);
  } };
  walk("app"); walk("components");
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^import \{([^}]*)\} from "[^"]+";$/gm)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(" as ").pop().trim();
        if (!name) continue;
        const uses = (src.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "g")) || []).length;
        if (uses <= 1) offenders.push(`${f}: ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `unused imports:\n${offenders.join("\n")}`);
});

test("the nav lists Builder before Squad and no retired routes", async () => {
  const shell = readFileSync("components/Shell.jsx", "utf8");
  const hrefs = PRIMARY_ROUTES.map((route) => route.href);
  assert.ok(hrefs.indexOf("/builder") < hrefs.indexOf("/squad"));
  assert.ok(!hrefs.some((href) => href.startsWith("/legacy")));
  assert.match(shell, /PRIMARY_ROUTES\.map/);
});

test("STATUS.md describes the app that exists", async () => {
  // STATUS.md had drifted badly: six pages, a removed Analyst, and "Season starts 28 Julust". A stale
  // status file is worse than none, because it is the first thing anyone reads.
  const { readFileSync, readdirSync } = await import("node:fs");
  const status = readFileSync("STATUS.md", "utf8");
  const pages = readdirSync("app", { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^(api|legacy|player)$/.test(d.name))
    .map((d) => d.name);
  for (const page of pages) {
    // A hyphenated title is a legitimate spelling of a route name: /lineups is "Line-ups".
    const loose = page.split("").join("-?");
    assert.ok(new RegExp(loose, "i").test(status), `STATUS.md does not mention the ${page} page`);
  }
  assert.ok(!/Analyst answers|Ask the Analyst/i.test(status), "the Analyst was removed and must not be described as live");
  assert.match(status, /DECISIONS\.md.*binding/i, "it must point at the contract");
});

test("the historical documents say so at the top", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["docs/tickets.md", "docs/campaign-plan.md"]) {
    const head = readFileSync(f, "utf8").slice(0, 400);
    assert.match(head, /HISTORICAL, NOT CURRENT/, `${f} must not read as current instructions`);
  }
});

test("every accessor a page calls on the model is actually returned by loadModel", async () => {
  // The Lineups page crashed on model.startProbOf because the accessor had been passed INTO
  // buildScorer's options instead of added to loadModel's return. buildScorer ignores options it does
  // not recognise, so nothing errored: it was silently undefined, and the auto-build's minutes filter
  // had been receiving nothing for several deliveries.
  const { readFileSync, readdirSync } = await import("node:fs");
  const proj = readFileSync("lib/projections.js", "utf8");
  const ret = proj.slice(proj.lastIndexOf("  return {"));
  const scorer = readFileSync("lib/solver/score.mjs", "utf8");
  const fromScorer = (scorer.match(/return \{ ([^}]*) \};/g) || []).join(" ");

  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) { if (!/node_modules/.test(f.name)) walk(`${d}/${f.name}`); }
    else if (/\.jsx?$/.test(f.name)) files.push(`${d}/${f.name}`);
  } };
  walk("app"); walk("components");

  const offenders = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?<![.\w])model\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
      const name = m[1];
      const declared = new RegExp(`\\b${name}\\b`).test(ret) || new RegExp(`\\b${name}\\b`).test(fromScorer);
      if (!declared) offenders.add(`${f}: model.${name} is used but loadModel never returns it`);
    }
  }
  assert.deepEqual([...offenders], [], [...offenders].join("\n"));
});

test("every page title equals its nav label", async () => {
  const src = readFileSync("components/Shell.jsx", "utf8");
  const titles = routeTitleMap({ "/status": "Status", "/analysis": "Analysis" });
  const offenders = PRIMARY_ROUTES.filter((route) => titles[route.href] !== route.label);
  assert.deepEqual(offenders, []);
  assert.match(src, /routeTitleMap/);
});

test("the loading screen is visible before anything else is drawn", async () => {
  // The app painted first and the overlay arrived a frame later, which is the flash Louis saw. It now
  // starts visible and the effect only ever hides it.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("components/Splash.jsx", "utf8");
  assert.match(src, /React\.useState\(true\)/, "it must start visible, not be switched on in an effect");
  assert.ok(!/setShow\(true\)/.test(src), "nothing may turn it on after the first paint");
  assert.match(src, /setShow\(false\); return;/, "a repeat visit hides it immediately");
});

test("the lock mark is one shape used for both kinds of lock", async () => {
  const { readFileSync } = await import("node:fs");
  const mark = readFileSync("components/LockMark.jsx", "utf8");
  assert.match(mark, /borderRadius: 6/, "a rounded square");
  assert.match(mark, /background: on \? T\.lock/, "filled yellow when on");
  assert.match(mark, /color=\{on \? "#0D0014"/, "with a black lock inside");
  // Yellow is for locks and nothing else.
  const ui = readFileSync("lib/ui.jsx", "utf8");
  assert.match(ui, /lock: "#FFD400"/, "one yellow token");
});

test("nothing in the permanent cleanup manifest is still imported anywhere", async () => {
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const targets = readFileSync("config/repository-cleanup-paths.txt", "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  assert.ok(targets.length > 10, `expected a permanent cleanup list, parsed ${targets.length}`);

  const codeTargets = targets.filter((target) => /\.(jsx|js|mjs)$/.test(target));
  const files = [];
  const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) { if (!/node_modules/.test(f.name)) walk(`${d}/${f.name}`); }
    else if (/\.(jsx|js|mjs)$/.test(f.name)) files.push(`${d}/${f.name}`);
  } };
  for (const d of ["app", "components", "lib", "jobs"]) walk(d);

  const offenders = [];
  for (const target of codeTargets) {
    const base = target.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    for (const f of files) {
      if (f === target) continue;
      const src = readFileSync(f, "utf8");
      const re = new RegExp(`(from|require\\()\\s*["'][^"']*\\/${base}["']`);
      if (re.test(src)) offenders.push(`${f} imports ${target}, which cleanup would delete`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("every interactive flow on every page is wired to something", async () => {
  /* Louis asked four times for a pass over every page and every button rather than only the things he had
     just named. This is that pass, held as a test: each entry is a control a person can press and the state
     it must actually change. A control that looks live and does nothing is the fault this catches. */
  const { readFileSync } = await import("node:fs");
  const pages = [
    ["Builder", "app/builder/BuilderClient.jsx", [
      ["the build button adapts to whether a squad exists", /squad\.players\.length \? doBestXI : doRebuild/],
      ["undo", /onClick=\{undo\}/],
      ["the draft dropdown loads a draft", /openPlan\(savedPlans\.find/],
      ["save posts to the API", /action: "save"/],
      ["copy payload", /copyPayload/],
      ["the formation dropdown changes the shape", /onStructure=\{setStructure\}/],
      ["the shape lock toggles", /setFormationLocked\(\(v\) => !v\)/],
      ["replace sets the player being replaced", /setReplacing\(menuFor\)/],
      ["the player list adds a player", /onAdd=\{add\}/],
    ]],
    ["Squad", "app/squad/SquadClient.jsx", [
      ["the team dropdown switches team", /setSelectedId\(e\.target\.value\)/],
      ["the exact gameweek range clamps to the fixture list", /<GameweekRange from=\{gwFrom\} to=\{gwTo\} min=\{firstGw\} max=\{lastGw\}/],
      ["saving creates a new draft", /saveAsNewDraft/],
      ["manage drafts opens", /setManaging\(\(v\) => !v\)/],
      ["a draft can be deleted", /planAction\("delete", pl\)/],
      ["the captain can be changed", /patchWeek\(\{ captain: menuFor\.fpl_id/],
      ["a transfer can be undone", /list\.splice\(i, 1\)/],
      ["the hidden live slot stays read only when restored", /const readOnly = !working \|\| \(SHOW_HARDCODED_SQUAD_4812 && selectedId === "live"\)/],
    ]],
    ["Players", "app/players/page.jsx", [
      ["search, club, position, price and ownership use the shared filter", /filterPlayerRows\(rows, \{/],
      ["the selected gameweeks use the shared cumulative calculator", /sumGameweekValues\(\{/],
      ["the visible order uses the shared deterministic sorter", /sortPlayerRows\(filtered, \{/],
      ["ownership is an actual filter", /ownershipMin: ownership\[0\]/],
      ["a column heading cycles the sort", /setSort\(cycleSort\(sort, c\.key\)\)/],
      ["reset restores every control", /const reset = /],
      ["compare caps at three", /cur\.length >= 3 \? cur/],
    ]],
    ["Dashboard", "app/page.jsx", [
      ["the ownership template refreshes while visible", /window\.setInterval\(refresh, 15 \* 60 \* 1000\)/],
      ["returning focus refreshes current ownership", /window\.addEventListener\("focus", refresh\)/],
    ]],
    ["Line-ups", "app/lineups/LineupsClient.jsx", [
      ["each dropdown switches its club", /onTeam=\{setLeft\}/],
      ["the published rows are drawn", /resolved\.map\(\(line/],
    ]],
  ];
  const broken = [];
  for (const [page, file, items] of pages) {
    const src = readFileSync(file, "utf8");
    for (const [what, re] of items) if (!re.test(src)) broken.push(`${page}: ${what}`);
  }
  assert.deepEqual(broken, [], `flows no longer wired:\n${broken.join("\n")}`);
});

test("no file is required to exist and queued for permanent cleanup at the same time", () => {
  const queued = new Set(read(join(ROOT, "config/repository-cleanup-paths.txt"))
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean));
  assert.ok(queued.size > 10, `expected a permanent cleanup list, parsed ${queued.size}`);

  const guards = read(join(ROOT, "tests/guards.test.mjs"));
  const mustBlock = guards.slice(guards.indexOf("const must = ["), guards.indexOf("];", guards.indexOf("const must = [")));
  const required = [...mustBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  const clash = required.filter((f) => queued.has(f));
  assert.deepEqual(clash, [], `these are required to exist AND queued for deletion: ${clash.join(", ")}`);
});
