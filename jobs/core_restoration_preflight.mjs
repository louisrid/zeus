import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail: String(detail) });
const text = (file) => readFileSync(join(ROOT, file), "utf8");
const has = (file, pattern) => pattern.test(text(file));

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".js", ".jsx", ".mjs"].includes(extname(full))) out.push(full);
  }
  return out;
}

const releaseWorkflowConfig = JSON.parse(text("config/release-workflow.json"));
const releaseWorkflowPath = releaseWorkflowConfig.path;
const releaseWorkflowName = releaseWorkflowConfig.name;
const releaseWorkflow = text(releaseWorkflowPath);
const projectionJob = text("jobs/projections_run.mjs");
const cleanupManifest = text("config/repository-cleanup-paths.txt");
const cleanupPaths = cleanupManifest
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*$/, "").trim())
  .filter(Boolean);

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
  "jobs/verify_projection_horizon_report.mjs",
  "jobs/verify_stored_projection_horizon.mjs",
  "jobs/verify_live_system.mjs",
  "lib/projection_horizon.mjs",
  "lib/projection_batch.mjs",
  "lib/engine/layer0_market.mjs",
  "lib/data.js",
  "lib/resolved_teams.mjs",
  "config/release-workflow.json",
  "config/repository-cleanup-paths.txt",
  releaseWorkflowPath,
];
for (const file of requiredFiles) check(`Required file exists: ${file}`, existsSync(join(ROOT, file)), file);

check("Projection generation supports the complete fixture-backed season",
  has("jobs/projections_run.mjs", /normaliseProjectionHorizon\(process\.env\.PROJECTION_GWS \|\| 38\)/)
    && has("jobs/projections_run.mjs", /selectProjectionHorizon/)
    && has("lib/projection_horizon.mjs", /targetGws\.length < required/)
    && has("lib/projection_horizon.mjs", /projection fixtures missing/),
  "fixture-backed horizon selected up to all 38 gameweeks");

check("Odds-free fixtures cannot be silently skipped",
  /fallbackGoalEnvironmentForTeams/.test(projectionJob)
    && /throw new Error\(`fixture \$\{fx\.id\} has no valid goal environment/.test(projectionJob)
    && !/if\s*\(!lambdas\)\s*continue\s*;?/.test(projectionJob)
    && has("lib/engine/layer0_market.mjs", /team-component-strength-fallback/)
    && has("lib/engine/layer0_market.mjs", /league-neutral-fallback/),
  "overall strength, venue components, then explicit neutral fallback; never continue past a fixture");

const horizonWriteIndex = projectionJob.indexOf('writeFileSync("projection-horizon-report.json"');
const databaseWriteIndex = projectionJob.indexOf('await upsertByGameweek("minutes_forecasts"');
check("The full projection horizon is proven before any database write",
  horizonWriteIndex >= 0
    && databaseWriteIndex > horizonWriteIndex
    && /projectionBatchReport\(/.test(projectionJob)
    && /if \(!horizonReport\.pass\)/.test(projectionJob)
    && /expectedPlayersPerGameweek:\s*profiles\.length/.test(projectionJob),
  "fixture simulation and per-player coverage fail closed before minutes/projections are upserted");

const postWriteIntegrityIndex = projectionJob.indexOf("await cleanupStaleProjections({");
const successHeartbeatIndex = projectionJob.indexOf('await beat("ok", msg)');
check("The persisted Supabase horizon is proven after the write and before success",
  postWriteIntegrityIndex > databaseWriteIndex
    && successHeartbeatIndex > postWriteIntegrityIndex
    && /expectedGameweeks:\s*targetGws/.test(projectionJob)
    && /expectedPlayersPerGameweek:\s*profiles\.length/.test(projectionJob)
    && /expectedComputedAt:\s*projectionComputedAt/.test(projectionJob)
    && has("jobs/projection_integrity_v14.mjs", /structural_failures/)
    && has("jobs/projection_integrity_v14.mjs", /blockingProjectionFailures/)
    && has("jobs/projection_integrity_v14.mjs", /expected_run_rows/)
    && has("jobs/projection_integrity_v14.mjs", /collectAllPages/)
    && !has("jobs/projection_integrity_v14.mjs", /limit=12000/)
    && has("jobs/verify_stored_projection_horizon.mjs", /exact-run row count/),
  "missing stored gameweeks always block, including diagnostic validation mode");

check("FPL refresh restores current teams and stamps every current fixture",
  has("jobs/fpl_bootstrap.mjs", /strength:\s*t\.strength, archive:\s*false/)
    && has("jobs/fpl_bootstrap.mjs", /season:\s*"2026-27", competition:\s*"PL"/),
  "current clubs stay live and future fixtures cannot disappear behind a null season");

check("Players page sums the selected gameweek range",
  has("app/players/page.jsx", /for \(let gw = gwFrom; gw <= gwTo; gw\+\+\)/), "scoreForGw loop");
check("Builder optimisation uses the selected range",
  has("app/builder/BuilderClient.jsx", /optimiseSquad\(squad, xpOverHorizon/)
    && has("app/builder/BuilderClient.jsx", /bestXI\(\{ pool, xpOf: xpOverHorizon/),
  "Best XI and Optimise share xpOverHorizon");
check("Builder shows one range control, not a duplicated control in Candidates",
  has("app/builder/BuilderClient.jsx", /showGameweekRange=\{false\}/)
    && has("app/builder/BuilderClient.jsx", /<GameweekRange[\s\S]*showPresets/), "one top-level range");
check("Builder optimiser is always present and safely disabled before a legal XI",
  has("app/builder/BuilderClient.jsx", /data-zeus-feature="builder-optimise-v3"/)
    && has("app/builder/BuilderClient.jsx", /disabled=\{squad\.players\.length < 11\}/), "stable toolbar layout");
check("Builder controls and workspace account for the fixed sidebar",
  has("app/builder/BuilderClient.jsx", /className="zeus-builder-workspace"/)
    && has("app/globals.css", /\.zeus-builder-workspace \{[\s\S]*minmax\(0, 1fr\) minmax\(320px, 380px\)/)
    && has("app/globals.css", /@media \(max-width: 1320px\)[\s\S]*\.zeus-builder-workspace \{ grid-template-columns: 1fr; \}/)
    && has("app/globals.css", /@media \(max-width: 600px\)[\s\S]*\.zeus-builder-toolbar, \.zeus-squad-toolbar \{ grid-template-columns: 1fr; \}/),
  "one-line controls on wide desktop; workspace and controls stack deliberately before overflow");
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

check("Workflow has a unique manual-only action and filename",
  new RegExp(`^name: ${releaseWorkflowName}$`, "m").test(releaseWorkflow)
    && /workflow_dispatch:/.test(releaseWorkflow)
    && !/^\s*push:/m.test(releaseWorkflow)
    && !/^\s*schedule:/m.test(releaseWorkflow),
  releaseWorkflowPath);
check("Workflow starts from fresh evidence",
  /rm -rf release-check-evidence xpts-live-validation/.test(releaseWorkflow)
    && /Create fresh final report/.test(releaseWorkflow), "no stale report can be uploaded as a new result");
check("A duplicate manual run cannot cancel an active database write",
  /cancel-in-progress:\s*false/.test(releaseWorkflow),
  "a second click queues instead of interrupting Supabase upserts");
check("Dependency resolution is reproducible without CI repository writes",
  /install_args=\(ci --no-audit --no-fund\)/.test(releaseWorkflow)
    && /install --package-lock=true --no-audit --no-fund/.test(releaseWorkflow)
    && !/git add -- package-lock\.json/.test(releaseWorkflow),
  "existing lockfiles use npm ci; fallback installs are validated without staging files");
check("Workflow verifies scheduled and post-presser runs stay at 38 gameweeks",
  has("jobs/prepare_permanent_projection_workflows.mjs", /setProjectionHorizonInWorkflow/)
    && /name: Set permanent projection workflows to the full 38-gameweek season/.test(releaseWorkflow)
    && /node jobs\/prepare_permanent_projection_workflows\.mjs/.test(releaseWorkflow)
    && has(".github/workflows/projections-run.yml", /PROJECTION_GWS:\s*["']38["']/)
    && has(".github/workflows/presser-pull.yml", /PROJECTION_GWS:\s*["']38["']/)
    && !/git add -- \.github\/workflows\/projections-run\.yml \.github\/workflows\/presser-pull\.yml/.test(releaseWorkflow),
  "both permanent workflows are configured for 38 gameweeks and verified without CI commits");
check("Workflow refreshes FPL reference data before projection generation",
  /node jobs\/fpl_bootstrap\.mjs/.test(releaseWorkflow)
    && /if: steps\.bootstrap\.outcome == 'success'/.test(releaseWorkflow),
  "teams, players, gameweeks and fixtures are current");
check("Workflow keeps football-quality validation separate from generation coverage",
  /PROJECTION_INTEGRITY_ENFORCE:\s*['"]0['"]?/.test(releaseWorkflow)
    && /PROJECTION_INTEGRITY_ENFORCE !== "0"/.test(projectionJob)
    && !/GITHUB_WORKFLOW ===/.test(projectionJob),
  "workflow renames cannot change projection behaviour");
check("Workflow requires and preserves generated and stored horizon reports",
  /projection-integrity-v14-report\.json/.test(releaseWorkflow)
    && /projection-horizon-report\.json/.test(releaseWorkflow)
    && /stored-projection-horizon-report\.json/.test(releaseWorkflow)
    && /node jobs\/verify_projection_horizon_report\.mjs projection-horizon-report\.json 38/.test(releaseWorkflow)
    && /node jobs\/verify_stored_projection_horizon\.mjs/.test(releaseWorkflow),
  "pre-write fixture/player coverage and post-write Supabase coverage are independently verified");
check("Live verification checks every gameweek in the requested horizon",
  /VERIFY_PROJECTION_GWS:\s*['"]38['"]?/.test(releaseWorkflow)
    && has("jobs/verify_live_system.mjs", /VERIFY_PROJECTION_GWS/)
    && has("jobs/verify_live_system.mjs", /for \(const futureGw of futureGameweeks\)/),
  "GW1 through GW38 must return live projections");
check("Repository cleanup is checked without destructive writes",
  /name: Confirm repository cleanup is already complete/.test(releaseWorkflow)
    && /git ls-files -- "\$path"/.test(releaseWorkflow)
    && /Repository cleanup is complete\./.test(releaseWorkflow)
    && !/git (?:rm|add|commit|push)/.test(releaseWorkflow),
  "read-only cleanup verification is safe even when an earlier release stage fails");
check("Repository cleanup verification remains read-only",
  /config\/repository-cleanup-paths\.txt/.test(releaseWorkflow)
    && /git ls-files -- "\$path"/.test(releaseWorkflow)
    && !/Verify the staged cleanup before committing/.test(releaseWorkflow)
    && !/cleanup-(?:preflight|tests|build)\.log/.test(releaseWorkflow)
    && !/git (?:rm|add|commit|push)/.test(releaseWorkflow),
  "obsolete tracked paths fail the check without staging, deleting, committing or pushing files");

const obsoleteWorkflows = cleanupPaths.filter((path) => path.startsWith(".github/workflows/") && /\.ya?ml$/.test(path));
const testFiles = walk(join(ROOT, "tests")).filter((file) => file.endsWith(".test.mjs"));
const obsoleteWorkflowReads = obsoleteWorkflows.flatMap((obsolete) => testFiles
  .filter((file) => {
    const source = readFileSync(file, "utf8");
    return source.includes(`readFileSync("${obsolete}"`)
      || source.includes(`readFileSync('${obsolete}'`)
      || source.includes(`read("${obsolete}"`)
      || source.includes(`read('${obsolete}'`)
      || source.includes(`new URL("../${obsolete}"`)
      || source.includes(`new URL('../${obsolete}'`);
  })
  .map((file) => `${file.slice(ROOT.length + 1)} reads ${obsolete}`));
check("Tests do not depend on workflows removed by repository cleanup", obsoleteWorkflowReads.length === 0,
  obsoleteWorkflowReads.join("; ") || "no obsolete workflow reads");

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
check("Release cleanup replaces all earlier recovery workflows but retains V5",
  /^\.github\/workflows\/zeus-release-check-v4\.yml$/m.test(cleanupManifest)
    && /^\.github\/workflows\/zeus-release-check-v3\.yml$/m.test(cleanupManifest)
    && /^\.github\/workflows\/zeus-release-check\.yml$/m.test(cleanupManifest)
    && /^\.github\/workflows\/xpts-live-validation\.yml$/m.test(cleanupManifest)
    && !cleanupPaths.includes(releaseWorkflowPath),
  `obsolete actions removed while ${releaseWorkflowPath} is retained`);

const unresolved = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)].map((match) => match[2]);
  for (const specifier of imports) {
    if (specifier.includes("$")) continue;
    const base = resolve(dirname(file), specifier);
    const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.json`, join(base, "index.js"), join(base, "index.jsx"), join(base, "index.mjs")];
    if (!candidates.some(existsSync)) unresolved.push(`${file.slice(ROOT.length + 1)} -> ${specifier}`);
  }
}
check("Every relative import resolves", unresolved.length === 0, unresolved.slice(0, 12).join("; ") || "all local imports found");

for (const file of ["config/engine-2026-27.json", "config/lineups.json", "config/rules-2026-27.json", "config/release-workflow.json"]) {
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
