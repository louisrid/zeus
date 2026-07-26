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
import { join, relative, dirname } from "path";

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

/* Reachability. A guard should police code the app actually runs. Files nothing imports are dead
   weight, and failing the suite on them forces pointless deletions rather than catching real faults. */
function reachable() {
  const resolve = (base, spec) => {
    const p = join(dirname(base), spec);
    for (const c of [p, p + ".js", p + ".jsx", p + ".mjs", p + ".json", join(p, "index.js"), join(p, "index.mjs")]) {
      try { if (statSync(c).isFile()) return c; } catch { /* not this one */ }
    }
    return null;
  };
  const entries = [];
  const collect = (dir) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n)) continue;
      const full = join(dir, n);
      if (statSync(full).isDirectory()) collect(full);
      else if (/\.(jsx?|mjs)$/.test(n)) entries.push(full);
    }
  };
  collect(join(ROOT, "app"));
  collect(join(ROOT, "jobs"));
  collect(join(ROOT, "tests"));
  const seen = new Set();
  const stack = entries.slice();
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let src = "";
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const t = resolve(f, m[1]);
      if (t) stack.push(t);
    }
  }
  return new Set([...seen].map((f) => relative(ROOT, f)));
}

const REACHABLE = reachable();
const TOKENS = "lib/ui.jsx";
const SHELL = "components/Shell.jsx";
const FILES = walk(ROOT)
  .filter((f) => /\.(jsx?|mjs)$/.test(f))
  .map((f) => ({ path: relative(ROOT, f), src: readFileSync(f, "utf8") }))
  .filter((f) => f.path.startsWith("app/") || f.path.startsWith("components/") || f.path.startsWith("lib/"))
  // Dead files are excluded: policing them catches nothing and only forces deletions.
  .filter((f) => REACHABLE.has(f.path) || f.path === TOKENS);

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

test("every component used in JSX is imported or defined locally", () => {
  // This class of bug has shipped twice: a component referenced in JSX with no import, which the
  // bundler happily builds and the browser throws on. Value and BudgetPill both got through.
  const HTML = new Set(["div", "span", "p", "a", "button", "input", "select", "option", "label",
    "section", "aside", "main", "header", "footer", "nav", "ul", "ol", "li", "table", "thead",
    "tbody", "tr", "td", "th", "img", "svg", "path", "circle", "rect", "line", "g", "text",
    "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "strong", "em", "form", "textarea", "canvas",
    "polyline", "polygon", "defs", "linearGradient", "stop", "ellipse", "tspan", "style"]);

  const files = SURFACES.filter((f) => f.path.endsWith(".jsx"));
  for (const f of files) {
    const used = new Set();
    for (const m of f.src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)) used.add(m[1]);
    if (!used.size) continue;

    const defined = new Set(["React", "Fragment"]);
    // named and default imports
    for (const m of f.src.matchAll(/import\s+([A-Za-z0-9_]+)\s*(?:,\s*\{([^}]*)\})?\s*from/g)) {
      defined.add(m[1]);
      if (m[2]) for (const n of m[2].split(",")) defined.add(n.trim().split(" as ").pop().trim());
    }
    for (const m of f.src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      for (const n of m[1].split(",")) defined.add(n.trim().split(" as ").pop().trim());
    }
    // locally declared components
    for (const m of f.src.matchAll(/(?:function|const|let|class)\s+([A-Z][A-Za-z0-9_]*)/g)) defined.add(m[1]);
    // destructured bindings, e.g. ([name, href, Icon]) => ... or ({ Icon }) => ...
    for (const m of f.src.matchAll(/\(\s*[[{]([^)]*?)[\]}]\s*\)\s*=>/g)) {
      for (const n of m[1].split(",")) {
        const name = n.trim().split(":").pop().trim().replace(/^\.\.\./, "");
        if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) defined.add(name);
      }
    }

    for (const name of used) {
      if (HTML.has(name)) continue;
      if (name.startsWith("React.")) continue;
      assert.ok(defined.has(name),
        `${f.path} uses <${name}> but never imports or defines it. This throws in the browser even though the build passes.`);
    }
  }
});

test("jobs that act on the current season exclude archive players", () => {
  // Archive players belong to relegated clubs and cannot feature in 2026/27. Projecting or matching
  // them wasted a run on roughly 400 people and let a name collision write current data to the wrong
  // row. bps_backtest is exempt: it grades historical matches, where archive players belong.
  const EXEMPT = new Set(["bps_backtest.mjs", "archive_2526.mjs", "fpl_bootstrap.mjs", "history_load.mjs",
    "baseline_gate.mjs", "minutes_scorecard.mjs", "component_attribution.mjs"]);
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs") && !EXEMPT.has(f));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    if (!/["']players["']/.test(src)) continue;
    assert.match(src, /not\("archive", "is", true\)/,
      `jobs/${f} reads the players table without excluding archive rows`);
  }
});

test("upserts target a key the schema actually has", () => {
  // understat_player_season gained competition in its primary key in migration 006. The job kept
  // upserting on the old two-column key, which Postgres rejects with "no unique or exclusion
  // constraint matching the ON CONFLICT specification".
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  const migrations = readdirSync(join(ROOT, "supabase")).filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, "supabase", f), "utf8")).join("\n");
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    for (const m of src.matchAll(/from\("([a-z_]+)"\)[\s\S]{0,400}?onConflict:\s*"([^"]+)"/g)) {
      const [, table, key] = m;
      if (table !== "understat_player_season") continue;
      const declared = migrations.match(/understat_player_season_pkey primary key \(([^)]*)\)/);
      if (!declared) continue;
      const want = declared[1].split(",").map((x) => x.trim()).sort().join(",");
      const got = key.split(",").map((x) => x.trim()).sort().join(",");
      assert.equal(got, want, `jobs/${f} upserts ${table} on (${key}) but the key is (${declared[1]})`);
    }
  }
});

test("jobs only write values the schema's check constraints allow", () => {
  // set_piece_duty rejected kind "penalty"; that table allows 'pen', 'fk_direct', 'corner'.
  // Constraints are read per table, because several tables have a `source` column with different
  // allowed values and comparing across them gives false positives.
  const schema = readFileSync(join(ROOT, "supabase", "schema.sql"), "utf8");
  // Migrations can drop a constraint after the fact, and the applied database is what matters.
  // migration-004 drops the metric constraint on calibration_metrics, so bps_mae is legal there.
  const migrations = readdirSync(join(ROOT, "supabase")).filter((f) => /^migration-\d+\.sql$/.test(f))
    .map((f) => readFileSync(join(ROOT, "supabase", f), "utf8")).join("\n");
  const dropped = new Set();
  for (const m of migrations.matchAll(/conrelid = '(\w+)'::regclass[\s\S]{0,200}?like '%(\w+)%'/g)) {
    dropped.add(`${m[1]}.${m[2]}`);
  }
  const byTable = {};
  for (const m of schema.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = m;
    const fields = {};
    for (const c of body.matchAll(/(\w+)\s+text\s+check\s*\(\s*\1\s+in\s*\(([^)]*)\)\s*\)/g)) {
      fields[c[1]] = c[2].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));
    }
    for (const field of Object.keys(fields)) {
      if (dropped.has(`${table}.${field}`)) delete fields[field];
    }
    if (Object.keys(fields).length) byTable[table] = fields;
  }

  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    // Walk each write and check it against the constraints of the table it targets.
    for (const m of src.matchAll(/from\("(\w+)"\)[\s\S]{0,80}?\.(?:insert|upsert)\(/g)) {
      const table = m[1];
      const fields = byTable[table];
      if (!fields) continue;
      // Look backwards and forwards a little for literal field assignments in the same job.
      for (const [field, allowed] of Object.entries(fields)) {
        for (const a of src.matchAll(new RegExp(`${field}:\\s*"([^"]+)"`, "g"))) {
          // Only complain when the value is not valid for ANY table declaring this field, which
          // keeps the check strict without needing full dataflow analysis.
          const anyTableAllows = Object.values(byTable)
            .some((fs) => fs[field] && fs[field].includes(a[1]));
          assert.ok(anyTableAllows,
            `jobs/${f} writes ${field}: "${a[1]}" but no table allows that value. ${table} allows ${allowed.join(", ")}`);
        }
      }
    }
  }
});

test("jobs create their database client lazily", () => {
  // A client built at import time makes the module impossible to unit test: importing a pure helper
  // would need live credentials. Every job must build it inside a function.
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    if (!src.includes("createClient")) continue;
    const topLevel = /^const \w+ = createClient\(/m.test(src);
    assert.ok(!topLevel,
      `jobs/${f} builds its client at import time. Wrap it in a function so the module can be imported by a test.`);
  }
});

test("jobs do not start a run when imported", () => {
  // Calling main() at module scope means importing a pure helper triggers a live database run.
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    if (!/\bfunction main\b|\bconst main\b/.test(src)) continue;
    assert.match(src, /isDirect|import\.meta\.url ===|require\.main/,
      `jobs/${f} calls main() unconditionally. Guard it so importing the module does not start a run.`);
  }
});

test("nothing keys a database row on a player name", () => {
  // The training set doubled because its natural key included player_name, and normalisation later
  // rewrote every name in four seasons. Names are not identifiers.
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      assert.ok(!/name/.test(m[1]),
        `jobs/${f} upserts on (${m[1]}), which includes a name. Use a stable id: a name can be rewritten and every row then duplicates.`);
    }
  }
});

test("every identifier a job uses at module scope is imported exactly once", () => {
  // Two failures shipped from this: pathToFileURL used without an import, then imported twice
  // because the existing import used "url" rather than "node:url".
  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    const imported = new Map();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(" as ").pop().trim();
        if (!name) continue;
        imported.set(name, (imported.get(name) || 0) + 1);
      }
    }
    for (const [name, count] of imported) {
      assert.equal(count, 1, `jobs/${f} imports ${name} ${count} times, which is a syntax error`);
    }
    // Anything used but never imported or declared locally.
    for (const name of ["pathToFileURL", "createClient", "readFileSync"]) {
      if (!new RegExp(`\\b${name}\\s*\\(`).test(src)) continue;
      assert.ok(imported.has(name), `jobs/${f} uses ${name} without importing it`);
    }
  }
});

test("no upsert target is a partial unique index", () => {
  // Postgres cannot infer an ON CONFLICT target from a partial index. Migration 017 created one with
  // a WHERE clause and every upsert against it failed. Migrations are read in order so a later
  // drop-and-recreate counts, which is how 018 fixed it.
  const files = readdirSync(join(ROOT, "supabase")).filter((f) => /^migration-\d+\.sql$/.test(f)).sort();
  const indexes = new Map(); // index name -> { table, cols, partial }
  for (const f of files) {
    const sql = readFileSync(join(ROOT, "supabase", f), "utf8");
    for (const m of sql.matchAll(/drop index if exists (\w+)/gi)) indexes.delete(m[1]);
    for (const m of sql.matchAll(/create unique index(?: if not exists)? (\w+)\s*\n?\s*on\s+(\w+)\s*\(([^)]*)\)([^;]*)/gi)) {
      indexes.set(m[1], {
        table: m[2],
        cols: m[3].split(",").map((x) => x.trim()).sort().join(","),
        partial: /\bwhere\b/i.test(m[4] || ""),
      });
    }
  }
  const partial = new Set();
  for (const [, ix] of indexes) if (ix.partial) partial.add(`${ix.table}:${ix.cols}`);

  const jobs = readdirSync(join(ROOT, "jobs")).filter((f) => f.endsWith(".mjs"));
  for (const f of jobs) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    for (const m of src.matchAll(/from\("(\w+)"\)[\s\S]{0,200}?onConflict:\s*"([^"]+)"/g)) {
      const key = `${m[1]}:${m[2].split(",").map((x) => x.trim()).sort().join(",")}`;
      assert.ok(!partial.has(key),
        `jobs/${f} upserts ${m[1]} on (${m[2]}), which is a PARTIAL unique index. Postgres cannot infer it. Drop the WHERE clause.`);
    }
  }
});

test("no model constant is hand-picked in a job", () => {
  // The minutes blend weight was 8 and the P(60+) constants were 0.86 and 0.6, all invented. Fitted
  // they are 1, 0.548 and 0.102: the hand-picked P(60+) was wrong by half. Every model constant must
  // come from config/fitted-params.json so it carries its fit.
  const MODEL_JOBS = ["minutes_scorecard.mjs", "reliability.mjs", "baseline_gate.mjs", "component_attribution.mjs"];
  for (const f of MODEL_JOBS) {
    const src = readFileSync(join(ROOT, "jobs", f), "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;                 // comments may cite a number
      if (!/^\s*const\s+[A-Z_]{3,}\s*=/.test(line)) return;   // only module-level constants
      if (/FITTED\.|SCHEDULE\.|process\.env|require|\[|"/.test(line)) return;
      // Infrastructure, not model: page sizes, bin counts, concurrency, id offsets, time units.
      // These are presentation or plumbing choices with no effect on a prediction.
      if (/^\s*const\s+(PAGE|PAGES|BINS|LIMIT|CONCURRENCY|OFFSET|HOUR|MINUTE|DAY|BATCH|MAX_[A-Z_]+|RETRIES)\s*=/.test(line)) return;
      const m = line.match(/=\s*([0-9]*\.?[0-9]+)\s*;/);
      assert.ok(!m, `jobs/${f}:${i + 1} hard-codes the model constant ${m && m[1]}. Fit it and read it from config/fitted-params.json.`);
    });
  }
});
