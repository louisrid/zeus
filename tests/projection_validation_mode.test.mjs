import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('projection validation mode exports a bad fresh generation instead of aborting before diagnosis', () => {
  const source = readFileSync(new URL('../jobs/projections_run.mjs', import.meta.url), 'utf8');
  assert.match(source, /GITHUB_WORKFLOW === "xpts-live-validation"/);
  assert.match(source, /cleanupStaleProjections\(\{ enforce: !validationMode \}\)/);
});

test('production integrity remains fail-closed by default', () => {
  const source = readFileSync(new URL('../jobs/projection_integrity_v14.mjs', import.meta.url), 'utf8');
  assert.match(source, /cleanupStaleProjections\(\{ enforce = true \} = \{\}\)/);
  assert.match(source, /if \(enforce\) throw new Error\(message\)/);
  assert.match(source, /Validation mode keeps the fresh generation available for export and diagnosis/);
});
