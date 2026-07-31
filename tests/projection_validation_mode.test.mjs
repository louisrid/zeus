import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readReleaseWorkflow } from './release_workflow_fixture.mjs';

test('projection validation mode is explicit and cannot break when the workflow is renamed', () => {
  const source = readFileSync(new URL('../jobs/projections_run.mjs', import.meta.url), 'utf8');
  const workflow = readReleaseWorkflow();
  assert.match(source, /PROJECTION_INTEGRITY_ENFORCE !== "0"/);
  assert.match(source, /cleanupStaleProjections\(\{ enforce: enforceProjectionIntegrity \}\)/);
  assert.doesNotMatch(source, /GITHUB_WORKFLOW ===/);
  assert.match(workflow, /PROJECTION_INTEGRITY_ENFORCE:\s*['"]0['"]/);
});

test('production integrity remains fail-closed by default', () => {
  const source = readFileSync(new URL('../jobs/projection_integrity_v14.mjs', import.meta.url), 'utf8');
  assert.match(source, /cleanupStaleProjections\(\{ enforce = true \} = \{\}\)/);
  assert.match(source, /if \(enforce\) throw new Error\(message\)/);
  assert.match(source, /Validation mode keeps the fresh generation available for export and diagnosis/);
});
