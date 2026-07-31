# ZEUS Known Failures and Lessons

## Purpose

This is the permanent record of failure patterns that must not be repeated.

## 1. Stale repository snapshots

### Failure

Patches were built against uploaded ZIPs or temporary local copies after the real GitHub repository had already changed.

### Effect

Files that passed locally did not represent the exact state uploaded to GitHub.

### Prevention

- Use the connected Git repository as the source of truth
- Record base SHA
- Test the exact branch commit
- Do not claim a ZIP represents `main` without checking

## 2. Separate code and workflow deliveries contradicted each other

### Failure

The code patch added a regression test requiring:

```yaml
cancel-in-progress: false
```

The separately delivered workflow still contained:

```yaml
cancel-in-progress: true
```

### Effect

Normal CI turned red immediately after the patch was uploaded.

### Prevention

- Keep workflow and tests in one branch
- Run the full suite on the exact assembled repository
- Do not provide untested alternate formats

## 3. Partial checks were presented as complete verification

### Failure

YAML parsing, Bash syntax, selected tests, synthetic fixture generation, and cleanup simulations were presented as strong proof of a live release.

### Effect

Real GitHub and Supabase failures appeared after repeated claims that the package was ready.

### Prevention

Static checks prove only their narrow subject. Full verification requires the exact repository, dependencies, complete tests, build, and relevant runtime environment.

## 4. Too many systems changed together

### Failure

UI, projection horizon, team strength, minutes, Supabase writes, cleanup, dependency locking, tests, and workflows were bundled together.

### Effect

Each red run exposed only the first failure. The next failure remained hidden.

### Prevention

- One logical system per PR
- Baseline first
- UI second
- Data pipeline third
- Football model fourth

## 5. GitHub Actions became the debugger

### Failure

The workflow stopped at the first production data error, a new patch was created, and the workflow was run again.

### Effect

One live-data defect was discovered per expensive red run.

### Prevention

Build a read-only audit that reports all malformed fixtures, teams, gameweeks, mappings, and generations in one pass before any write.

## 6. V4 skipped future fixtures

### Failure

The release selected GW1 to GW8 and 80 fixtures, but odds-free future fixtures could not produce a goal environment and were silently skipped.

### Observed result

- Only 564 GW1 rows were written
- 70 future fixtures were skipped
- Future API requests returned no projections

### Additional failure

Repository cleanup was allowed to run after live verification had failed.

### Prevention

- No silent `continue` for selected fixtures
- Pre-write fixture and player coverage
- No cleanup unless all live stages pass

## 7. V5 failed on malformed archive fixture 1000005

### Failure

`jobs/projections_run.mjs` validated all fixture rows before selecting the current horizon.

A finished 2025/26 archive fixture had:

```text
fixture: 1000005
away_team: null
```

### Observed error

```text
invalid away team for fixture 1000005: null
```

### Why retries cannot help

The same deterministic database row is read every time.

### Required system fix

- Audit and repair malformed archive data
- Filter or classify fixture rows before strict current-horizon validation
- Ignore malformed finished historical rows for current live generation, with warnings
- Still block malformed current or upcoming rows
- Make the archive importer update damaged existing rows

The supplied repository does not yet contain the proposed fixture-row repair helper.

## 8. Archive importer could not repair existing rows

### Failure

The archive job loaded existing fixture IDs into a map and inserted only missing fixtures.

### Effect

A damaged existing fixture remained damaged forever.

### Prevention

Use validated upsert or explicit repair logic for archive fixture identity and team fields.

## 9. Tidy workflow checksum command was malformed

### Failure

The tidy workflow piped checksum-file contents through `xargs sha256sum -c`.

### Observed result

Each hash and filename was treated as a separate checksum file argument, producing errors such as:

```text
sha256sum: <hash>: No such file or directory
sha256sum: .github/workflows/ci.yml: no properly formatted checksum lines found
```

### Prevention

Run:

```bash
sha256sum -c tidy-evidence/protected-before.sha256
```

against the checksum manifest itself.

## 10. Old PASS evidence was uploaded after a new failure

### Failure

A workflow failed before generating fresh evidence, then uploaded an old committed PASS report.

### Effect

The artifact did not contain the actual failing stage.

### Prevention

- Delete generated evidence at workflow start
- Log every step separately
- Create a fresh report under `if: always()`
- Never commit transient PASS evidence as the current result

## 11. Status documents became false authority

### Failure

`STATUS.md`, `ZEUS_XPTS_STATE.md`, and release verification files recorded packages as ready before live success.

### Effect

Future work treated stale claims as facts.

### Prevention

Current state must be derived from Git, CI, deployment, and database evidence. Documentation should record evidence and unknowns, not confidence language.

## 12. Tests were changed around deleted workflows

### Failure

Cleanup removed workflows while tests still expected them, or later tests were altered to expect a replacement workflow before the replacement was proven.

### Prevention

Workflow cleanup and workflow-contract tests must be changed in the same PR and pass before deletion is committed.

## 13. Engine and display scoring diverged

### Failure

The raw simulation produced one projection, while the app could apply a second minutes multiplier or replace the row with a fallback.

### Effect

Low-minute players were punished twice, while some low-sample players received generous fallback output.

### Prevention

One coherent final scoring route for current active projections.

## 14. Named-player symptoms were mistaken for isolated bugs

Examples included:

- Palmer below Caicedo
- Virgil and Alisson too low
- Matheus Nunes too low
- Osula too high
- Gabriel unusually high
- Lacroix assigned to the wrong club

These are diagnostic examples. Fix the underlying minutes, identity, allocation, team-strength, or fallback system. Do not hard-code their outputs.

## 15. Obsolete release lineage

The following names belong to failed or superseded one-off attempts and must not be revived casually:

- `xpts-live-validation.yml`
- `zeus-final-release.yml`
- `zeus-core-restoration-v1.yml`
- `zeus-core-restoration-v2.yml`
- `zeus-core-restoration-v3.yml`
- `zeus-release-check.yml`
- `zeus-release-check-v2.yml`
- `zeus-release-check-v3.yml`
- `zeus-release-check-v4.yml`
- Apply-repair V11 to V15 workflows

`zeus-release-check-v5.yml` remains in the repository but is not proven successful and must not be run during baseline recovery.

## 16. The core process lesson

The correct sequence is:

1. Prove a baseline
2. Change one thing
3. Run complete checks
4. Deploy a preview
5. Accept or revert
6. Move to the next system

Do not create another all-in-one rescue release.
