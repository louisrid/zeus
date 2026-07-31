# ZEUS Core Restoration V3

This release replaces the failed V2 validation action.

## Exact V2 failure

V2 failed because one regression test inspected unrelated legacy workflow files that Mac had not uploaded. The projection engine already enforced a hard eight-gameweek minimum, so this was a false static-config failure rather than a projection runtime failure.

## V3 reliability changes

- New workflow filename and action name.
- The test now validates the engine guarantee and the V3 release workflow only.
- Dependency installation remains the same GitHub-tested `npm install` path used by the successful earlier release.
- Fresh evidence directory and artifact for every run.
- Runtime future-gameweek, Builder, Squad, Players, Vercel and OpenWeb checks remain mandatory.
- Builder and Squad action bars use compact, consistent controls with deliberate responsive wrapping.
