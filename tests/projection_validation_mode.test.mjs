import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readReleaseWorkflow } from "./release_workflow_fixture.mjs";
import { blockingProjectionFailures } from "../jobs/projection_integrity_v14.mjs";


test("projection validation mode is explicit and cannot break when the workflow is renamed", () => {
  const source = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  const workflow = readReleaseWorkflow();
  assert.match(source, /PROJECTION_INTEGRITY_ENFORCE !== "0"/);
  assert.match(source, /await cleanupStaleProjections\(\{/);
  assert.match(source, /enforce:\s*enforceProjectionIntegrity/);
  assert.match(source, /expectedGameweeks:\s*targetGws/);
  assert.match(source, /expectedPlayersPerGameweek:\s*profiles\.length/);
  assert.match(source, /expectedComputedAt:\s*projectionComputedAt/);
  assert.doesNotMatch(source, /GITHUB_WORKFLOW ===/);
  assert.match(workflow, /PROJECTION_INTEGRITY_ENFORCE:\s*['"]0['"]/);
});


test("validation mode can relax football-quality checks but can never bypass horizon failures", () => {
  const quality = [{ gw: 1, kind: "premium_attackers_below_225" }];
  const structural = [{ gw: 2, kind: "missing_gameweek_generation" }];
  assert.deepEqual(blockingProjectionFailures({
    structuralFailures: [],
    qualityFailures: quality,
    enforceQuality: false,
  }), []);
  assert.deepEqual(blockingProjectionFailures({
    structuralFailures: structural,
    qualityFailures: quality,
    enforceQuality: false,
  }), structural);
});


test("production integrity remains fail-closed by default", () => {
  const source = readFileSync(new URL("../jobs/projection_integrity_v14.mjs", import.meta.url), "utf8");
  assert.match(source, /cleanupStaleProjections\(\{\s*enforce = true,/s);
  assert.match(source, /if \(report\.blocking_failures\.length\)/);
  assert.match(source, /throw new Error\(message\)/);
  assert.match(source, /Validation mode keeps the structurally complete generation available for export and diagnosis/);
});
