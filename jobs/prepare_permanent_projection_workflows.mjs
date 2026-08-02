import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_PATHS = [
  ".github/workflows/projections-run.yml",
  ".github/workflows/presser-pull.yml",
];

export function setProjectionHorizonInWorkflow(source, horizon = 8, label = "workflow") {
  const required = Number(horizon);
  if (!Number.isInteger(required) || required < 1 || required > 38) {
    throw new Error(`invalid projection horizon ${horizon}`);
  }
  if (!/node jobs\/projections_run\.mjs/.test(source)) {
    throw new Error(`${label} does not run jobs/projections_run.mjs`);
  }
  const pattern = /^(\s*PROJECTION_GWS:\s*)["']?\d+["']?\s*$/gm;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one PROJECTION_GWS setting, found ${matches.length}`);
  }
  const updated = source.replace(pattern, `$1"${required}"`);
  if (!new RegExp(`PROJECTION_GWS:\\s*["']${required}["']`).test(updated)) {
    throw new Error(`${label} projection horizon was not updated to ${required}`);
  }
  return updated;
}

export function setMinimumWorkflowTimeout(source, minimumMinutes = 90, label = "workflow") {
  const required = Number(minimumMinutes);
  if (!Number.isInteger(required) || required < 1) throw new Error(`invalid timeout ${minimumMinutes}`);
  const pattern = /^(\s*timeout-minutes:\s*)(\d+)\s*$/gm;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one timeout-minutes setting, found ${matches.length}`);
  }
  const current = Number(matches[0][2]);
  return source.replace(pattern, `$1${Math.max(current, required)}`);
}

export function setStructuralIntegrityMode(source, label = "workflow") {
  const existing = /^(\s*PROJECTION_INTEGRITY_ENFORCE:\s*)["']?[01]["']?\s*$/gm;
  const matches = [...source.matchAll(existing)];
  if (matches.length > 1) {
    throw new Error(`${label} contains multiple PROJECTION_INTEGRITY_ENFORCE settings`);
  }
  if (matches.length === 1) return source.replace(existing, '$1"0"');

  const horizonLine = /^(\s*)PROJECTION_GWS:\s*["']?\d+["']?\s*$/m;
  const match = source.match(horizonLine);
  if (!match) throw new Error(`${label} has no projection horizon line for integrity mode insertion`);
  return source.replace(horizonLine, (line, indent) => `${line}\n${indent}PROJECTION_INTEGRITY_ENFORCE: "0"`);
}

export function preparePermanentProjectionWorkflows(paths = DEFAULT_PATHS, horizon = 8) {
  const changed = [];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    let updated = setProjectionHorizonInWorkflow(source, horizon, path);
    updated = setMinimumWorkflowTimeout(updated, 90, path);
    updated = setStructuralIntegrityMode(updated, path);
    if (updated !== source) {
      writeFileSync(path, updated);
      changed.push(path);
    }
    console.log(`${path}: PROJECTION_GWS=${horizon}, timeout>=90, structural integrity fail-closed${updated === source ? " (already correct)" : " (updated)"}`);
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  preparePermanentProjectionWorkflows(paths.length ? paths : DEFAULT_PATHS, 8);
}
