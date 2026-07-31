# ZEUS Final Core Recovery

## Exact failure repaired

The V3 action reached the real Next.js production build and failed because `app/globals.css` ended with a duplicated mobile rules block and an unmatched closing brace. The duplicate block and extra brace were removed.

## Permanent release workflow

The replacement action is permanent rather than versioned:

- File: `.github/workflows/zeus-release-check.yml`
- GitHub action: `ZEUS Release Check`
- Trigger: manual only

It runs source preflight, dependency installation, a dedicated CSS structural test, the complete test suite, the production build, eight-gameweek generation, projection release gates, deployed Players/Builder/Squad checks, Vercel verification, OpenWeb verification and final repository cleanup.

## Repository cleanup

After every product and live check succeeds, the action removes obsolete versioned restoration workflows, the old xPTS live-validation workflow, the old final-release workflow, the retired tidy workflow and stale committed release reports. Scheduled production jobs and useful diagnostic workflows remain.

## Local verification

- 520/520 tests passed.
- Release preflight passed.
- Global CSS passed both the new Node structural test and an independent CSS parser.
- All new workflow shell blocks passed Bash syntax checking.
- Workflow YAML parsed successfully.
- The cleanup was replayed in a temporary Git repository and removed the intended obsolete paths while retaining `zeus-release-check.yml`.
