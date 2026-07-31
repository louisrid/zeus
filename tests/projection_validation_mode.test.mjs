import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('projection persistence never permits a validation mode to bypass exact read-back', () => {
  const source = readFileSync(new URL('../jobs/projections_run.mjs', import.meta.url), 'utf8');
  assert.match(source, /persistProjectionGeneration/);
  assert.match(source, /readBack:/);
  assert.ok(!source.includes('PROJECTION_INTEGRITY_ENFORCE === "0"'));
  assert.ok(!source.includes('GITHUB_WORKFLOW === "xpts-live-validation"'));
});

test('production integrity remains fail-closed by default', () => {
  const source = readFileSync(new URL('../jobs/projection_integrity_v14.mjs', import.meta.url), 'utf8');
  assert.match(source, /cleanupStaleProjections\(\{ enforce = true \} = \{\}\)/);
  assert.match(source, /if \(enforce\) throw new Error\(message\)/);
  assert.match(source, /Validation mode keeps the fresh generation available for export and diagnosis/);
});
