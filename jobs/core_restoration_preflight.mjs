import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail: String(detail) });
const text = (file) => readFileSync(join(ROOT, file), "utf8");
const has = (file, pattern) => pattern.test(text(file));

const requiredFiles = [
  "app/builder/BuilderClient.jsx",
  "app/players/page.jsx",
  "app/squad/SquadClient.jsx",
  "components/GameweekRange.jsx",
  "components/PlayerControls.jsx",
  "components/Candidates.jsx",
  "jobs/projections_run.mjs",
  "jobs/verify_live_system.mjs",
  "lib/data.js",
  "lib/resolved_teams.mjs",
  ".github/workflows/zeus-core-restoration-v2.yml",
];
for (const file of requiredFiles) check(`Required file exists: ${file}`, existsSync(join(ROOT, file)), file);

check("Projection generation covers at least eight gameweeks",
  has("jobs/projections_run.mjs", /HORIZON\s*=\s*Math\.max\(8,/), "hard minimum 8");
check("Players page sums the selected gameweek range",
  has("app/players/page.jsx", /for \(let gw = gwFrom; gw <= gwTo; gw\+\+\)/), "scoreForGw loop");
check("Builder optimisation uses the selected range",
  has("app/builder/BuilderClient.jsx", /optimiseSquad\(squad, xpOverHorizon/)
    && has("app/builder/BuilderClient.jsx", /bestXI\(\{ pool, xpOf: xpOverHorizon/), "Best XI and Optimise share xpOverHorizon");
check("Builder shows one range control, not a duplicated control in Candidates",
  has("app/builder/BuilderClient.jsx", /showGameweekRange=\{false\}/)
    && has("app/builder/BuilderClient.jsx", /<GameweekRange[\s\S]*showPresets/), "one top-level range");
check("Builder optimiser is always present and safely disabled before a legal XI",
  has("app/builder/BuilderClient.jsx", /data-zeus-feature="builder-optimise-v2"/)
    && has("app/builder/BuilderClient.jsx", /disabled=\{squad\.players\.length < 11\}/), "stable toolbar layout");
check("Squad optimiser is present and writes one atomic plan update",
  has("app/squad/SquadClient.jsx", /data-zeus-feature="squad-optimise-v2"/)
    && has("app/squad/SquadClient.jsx", /writePlan\(\{[\s\S]*startingIds/)
    && !has("app/squad/SquadClient.jsx", /patchWeek\(\{[\s\S]{0,250}writePlan\(/), "single write");
check("Transferred players are retained until projection-backed team resolution",
  has("lib/data.js", /Do not discard an otherwise valid player/)
    && has("lib/projections.js", /applyResolvedTeams/), "no pre-resolution drop");
check("All three restored pages carry the deployable UI marker",
  ["app/builder/BuilderClient.jsx", "app/players/page.jsx", "app/squad/SquadClient.jsx"]
    .every((file) => has(file, /data-zeus-ui-version="core-restoration-v2"/)), "core-restoration-v2");
check("Workflow has a unique action and filename",
  has(".github/workflows/zeus-core-restoration-v2.yml", /^name:\s*ZEUS Core Restoration V2/m)
    && has(".github/workflows/zeus-core-restoration-v2.yml", /workflow_dispatch/), "manual-only V2 action");
check("Workflow never uploads a stale validation report",
  has(".github/workflows/zeus-core-restoration-v2.yml", /rm -rf core-restoration-v2-evidence/)
    && has(".github/workflows/zeus-core-restoration-v2.yml", /Create fresh final report/), "fresh run evidence");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".js", ".jsx", ".mjs"].includes(extname(full))) out.push(full);
  }
  return out;
}

const unresolved = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)].map((m) => m[2]);
  for (const specifier of imports) {
    if (specifier.includes("$")) continue; // replacement-template text inside tests, not a real import
    const base = resolve(dirname(file), specifier);
    const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.json`, join(base, "index.js"), join(base, "index.jsx"), join(base, "index.mjs")];
    if (!candidates.some(existsSync)) unresolved.push(`${file.slice(ROOT.length + 1)} -> ${specifier}`);
  }
}
check("Every relative import resolves", unresolved.length === 0, unresolved.slice(0, 12).join("; ") || "all local imports found");

for (const file of ["config/engine-2026-27.json", "config/lineups.json", "config/rules-2026-27.json"]) {
  try { JSON.parse(text(file)); check(`JSON parses: ${file}`, true, "valid"); }
  catch (error) { check(`JSON parses: ${file}`, false, error.message); }
}

const failed = checks.filter((item) => !item.pass);
const report = { pass: failed.length === 0, generated_at: new Date().toISOString(), checks, failed: failed.map((item) => item.name) };
const lines = [
  "# ZEUS Core Restoration V2 Preflight",
  "",
  `**Status: ${report.pass ? "PASS" : "FAIL"}**`,
  "",
  ...checks.flatMap((item) => [`- **${item.pass ? "PASS" : "FAIL"}: ${item.name}**  `, `  ${item.detail}`]),
  "",
];
writeFileSync(join(ROOT, "core-restoration-v2-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(ROOT, "docs/core-restoration-v2-preflight.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
if (!report.pass) process.exitCode = 1;
