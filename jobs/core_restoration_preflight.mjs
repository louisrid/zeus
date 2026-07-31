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
  "jobs/fpl_bootstrap.mjs",
  "jobs/projections_run.mjs",
  "jobs/projection_integrity_v14.mjs",
  "lib/projection_horizon.mjs",
  "jobs/verify_live_system.mjs",
  "lib/data.js",
  "lib/resolved_teams.mjs",
  ".github/workflows/zeus-release-check.yml",
];
for (const file of requiredFiles) check(`Required file exists: ${file}`, existsSync(join(ROOT, file)), file);

check("Projection generation covers at least eight fixture-backed gameweeks",
  has("jobs/projections_run.mjs", /normaliseProjectionHorizon/)
    && has("jobs/projections_run.mjs", /selectProjectionHorizon/)
    && has("lib/projection_horizon.mjs", /targetGws\.length < required/)
    && has("lib/projection_horizon.mjs", /projection fixtures missing/),
  "hard minimum 8, derived from upcoming fixtures");
check("FPL refresh restores current teams and stamps every current fixture",
  has("jobs/fpl_bootstrap.mjs", /strength:\s*t\.strength, archive:\s*false/)
    && has("jobs/fpl_bootstrap.mjs", /season:\s*"2026-27", competition:\s*"PL"/),
  "current clubs stay live and future fixtures cannot disappear behind a null season");
check("Players page sums the selected gameweek range",
  has("app/players/page.jsx", /for \(let gw = gwFrom; gw <= gwTo; gw\+\+\)/), "scoreForGw loop");
check("Builder optimisation uses the selected range",
  has("app/builder/BuilderClient.jsx", /optimiseSquad\(squad, xpOverHorizon/)
    && has("app/builder/BuilderClient.jsx", /bestXI\(\{ pool, xpOf: xpOverHorizon/), "Best XI and Optimise share xpOverHorizon");
check("Builder shows one range control, not a duplicated control in Candidates",
  has("app/builder/BuilderClient.jsx", /showGameweekRange=\{false\}/)
    && has("app/builder/BuilderClient.jsx", /<GameweekRange[\s\S]*showPresets/), "one top-level range");
check("Builder optimiser is always present and safely disabled before a legal XI",
  has("app/builder/BuilderClient.jsx", /data-zeus-feature="builder-optimise-v3"/)
    && has("app/builder/BuilderClient.jsx", /disabled=\{squad\.players\.length < 11\}/), "stable toolbar layout");
check("Squad optimiser is present and writes one atomic plan update",
  has("app/squad/SquadClient.jsx", /data-zeus-feature="squad-optimise-v3"/)
    && has("app/squad/SquadClient.jsx", /writePlan\(\{[\s\S]*startingIds/)
    && !has("app/squad/SquadClient.jsx", /patchWeek\(\{[\s\S]{0,250}writePlan\(/), "single write");
check("Transferred players are retained until projection-backed team resolution",
  has("lib/data.js", /Do not discard an otherwise valid player/)
    && has("lib/projections.js", /applyResolvedTeams/), "no pre-resolution drop");
check("All three restored pages carry the deployable UI marker",
  ["app/builder/BuilderClient.jsx", "app/players/page.jsx", "app/squad/SquadClient.jsx"]
    .every((file) => has(file, /data-zeus-ui-version="core-restoration-v3"/)), "core-restoration-v3");
check("Workflow has a unique action and filename",
  has(".github/workflows/zeus-release-check.yml", /^name:\s*ZEUS Release Check/m)
    && has(".github/workflows/zeus-release-check.yml", /workflow_dispatch/), "manual-only permanent release action");
check("Workflow never uploads a stale validation report",
  has(".github/workflows/zeus-release-check.yml", /rm -rf release-check-evidence/)
    && has(".github/workflows/zeus-release-check.yml", /Create fresh final report/), "fresh run evidence");
check("Workflow refreshes FPL reference data before projection generation",
  has(".github/workflows/zeus-release-check.yml", /node jobs\/fpl_bootstrap\.mjs/)
    && has(".github/workflows/zeus-release-check.yml", /if: steps\.bootstrap\.outcome == 'success'/),
  "teams, players, gameweeks and fixtures are current");
check("Workflow exports the fresh generation before the separate quality gate",
  has(".github/workflows/zeus-release-check.yml", /PROJECTION_INTEGRITY_ENFORCE:\s*['"]0['"]?/)
    && has("jobs/projections_run.mjs", /PROJECTION_INTEGRITY_ENFORCE !== "0"/)
    && !has("jobs/projections_run.mjs", /GITHUB_WORKFLOW ===/),
  "explicit validation mode survives workflow renames");
check("Workflow preserves the exact projection integrity report",
  has(".github/workflows/zeus-release-check.yml", /projection-integrity-v14-report\.json/),
  "blocking and warning rows remain downloadable");
check("Repository cleanup runs after a proven build even when live validation fails",
  has(".github/workflows/zeus-release-check.yml", /if: always\(\) && steps\.preflight\.outcome == 'success'/)
    && (text(".github/workflows/zeus-release-check.yml").match(/done < config\/repository-cleanup-paths\.txt/g) || []).length >= 2,
  "remove and verify every configured obsolete path");

function cssStructureErrors(source) {
  const errors = [];
  let depth = 0;
  let quote = null;
  let inComment = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inComment) {
      if (char === "*" && next === "/") { inComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") { inComment = true; i += 1; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth < 0) { errors.push(`unexpected closing brace at character ${i}`); depth = 0; }
    }
  }
  if (inComment) errors.push("unterminated comment");
  if (quote) errors.push("unterminated string");
  if (depth !== 0) errors.push(`${depth} unclosed CSS blocks`);
  return errors;
}

const cssErrors = cssStructureErrors(text("app/globals.css"));
check("Global CSS structure is valid before Next build", cssErrors.length === 0, cssErrors.join("; ") || "balanced blocks");
check("Release cleanup replaces versioned recovery clutter",
  has("config/repository-cleanup-paths.txt", /zeus-core-restoration-v3\.yml/)
    && has("config/repository-cleanup-paths.txt", /xpts-live-validation\.yml/)
    && !has("config/repository-cleanup-paths.txt", /zeus-release-check\.yml/),
  "old one-off actions removed, permanent release action retained");

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
  "# ZEUS Release Check Preflight",
  "",
  `**Status: ${report.pass ? "PASS" : "FAIL"}**`,
  "",
  ...checks.flatMap((item) => [`- **${item.pass ? "PASS" : "FAIL"}: ${item.name}**  `, `  ${item.detail}`]),
  "",
];
writeFileSync(join(ROOT, "release-check-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(ROOT, "docs/release-check-preflight.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
if (!report.pass) process.exitCode = 1;
