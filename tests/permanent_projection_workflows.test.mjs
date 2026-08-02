import test from "node:test";
import assert from "node:assert/strict";
import {
  preparePermanentProjectionWorkflows,
  setMinimumWorkflowTimeout,
  setProjectionHorizonInWorkflow,
  setStructuralIntegrityMode,
} from "../jobs/prepare_permanent_projection_workflows.mjs";

test("permanent projection workflows are normalised from three to the full 38 gameweeks", () => {
  const source = `name: projections-run\njobs:\n  projections:\n    timeout-minutes: 30\n    steps:\n      - run: node jobs/projections_run.mjs\n        env:\n          PROJECTION_GWS: "3"\n`;
  const updated = setProjectionHorizonInWorkflow(source, 38, "fixture");
  assert.match(updated, /PROJECTION_GWS: "38"/);
  assert.doesNotMatch(updated, /PROJECTION_GWS: "3"/);
});

test("permanent workflow timeout is raised for full-season generation", () => {
  const source = `jobs:\n  projections:\n    timeout-minutes: 30\n`;
  assert.match(setMinimumWorkflowTimeout(source, 90, "fixture"), /timeout-minutes: 90/);
  assert.match(setMinimumWorkflowTimeout(source.replace("30", "120"), 90, "fixture"), /timeout-minutes: 120/);
});

test("scheduled workflows keep structural failures blocking without red actions for review-only quality flags", () => {
  const source = `- run: node jobs/projections_run.mjs\n  env:\n    PROJECTION_GWS: "38"\n`;
  const updated = setStructuralIntegrityMode(source, "fixture");
  assert.match(updated, /PROJECTION_INTEGRITY_ENFORCE: "0"/);
});

test("workflow horizon normalisation is idempotent", () => {
  const source = `- run: node jobs/projections_run.mjs\n  env:\n    PROJECTION_GWS: '38'\n`;
  const once = setProjectionHorizonInWorkflow(source, 38, "fixture");
  const twice = setProjectionHorizonInWorkflow(once, 38, "fixture");
  assert.equal(twice, once);
});

test("workflow horizon normalisation refuses ambiguous files", () => {
  const source = `- run: node jobs/projections_run.mjs\n  env:\n    PROJECTION_GWS: "3"\n    PROJECTION_GWS: "4"\n`;
  assert.throws(() => setProjectionHorizonInWorkflow(source, 38, "fixture"), /exactly one/);
});

test("workflow preparation updates real files without changing unrelated YAML", async (t) => {
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "zeus-workflow-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "projection.yml");
  const source = `name: keep-me\njobs:\n  projections:\n    timeout-minutes: 30\n    steps:\n      - run: node jobs/projections_run.mjs\n        env:\n          TOKEN: unchanged\n          PROJECTION_GWS: "3"\n`;
  await writeFile(path, source);
  preparePermanentProjectionWorkflows([path], 38);
  const updated = await readFile(path, "utf8");
  assert.match(updated, /^name: keep-me$/m);
  assert.match(updated, /TOKEN: unchanged/);
  assert.match(updated, /timeout-minutes: 90/);
  assert.match(updated, /PROJECTION_GWS: "38"/);
  assert.match(updated, /PROJECTION_INTEGRITY_ENFORCE: "0"/);
});
