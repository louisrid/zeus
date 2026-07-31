# ZEUS Source Index

## Authority classes

### Class A: Current evidence

These should be trusted first:

- Exact Git repository and Git history
- Current GitHub Actions results
- Current Vercel deployment state
- Current Supabase schema and read-only data audit
- Current source files and tests

### Class B: Current canonical context

- `AGENTS.md`
- `docs/zeus/00-PROJECT-BRIEF.md`
- `docs/zeus/01-CURRENT-STATE.md`
- `docs/zeus/02-RECOVERY-PLAN.md`
- `docs/zeus/03-V2-PRODUCT-SCOPE.md`
- `docs/zeus/04-XPTS-ARCHITECTURE.md`
- `docs/zeus/05-COMPETITOR-SYSTEM.md`
- `docs/zeus/06-KNOWN-FAILURES.md`
- `docs/zeus/07-DECISIONS.md`
- `docs/zeus/08-ACCEPTANCE-CRITERIA.md`
- `docs/zeus/09-ACTIVE-TASKS.md`

### Class C: Existing repository product history

- `docs/DECISIONS.md`
- `docs/HANDOVER.md`
- `README.md`
- `docs/scoring-formulas.md`
- `docs/model-exclusions.md`
- `docs/xp-xprice-roadmap.md`
- Existing tests

Use these for product history. Check them against current code before treating them as current state.

### Class D: Historical repair records

- `STATUS.md`
- `ZEUS_XPTS_STATE.md`
- `docs/xpts-step*.md`
- `docs/zeus-core-restoration*.md`
- Old workflow verification reports

These document intentions, previous work, and failed attempts. They are not release proof.

## External source documents used to create this pack

### `competitor.txt`

Detailed reverse engineering of FPL Copilot, including:

- Projection versus solver separation
- Team xG and opponent xG
- Player attacking allocation
- Penalties
- Expected minutes
- Clean sheets
- Bonus
- Cards
- Double-gameweek structure
- Worked Haaland, Mbeumo, and Guéhi examples

Condensed into `05-COMPETITOR-SYSTEM.md`.

### `mine is zeus(1).txt`

Detailed explanation of historical ZEUS calculation paths:

- Raw joint simulation
- Team goal environment
- Player allocation
- Minutes
- FPL scoring
- BPS
- App-facing fallback scorer
- Stale-engine rejection
- Known structural problems

Condensed into `04-XPTS-ARCHITECTURE.md` and `06-KNOWN-FAILURES.md`.

### `maybe.txt`

ZEUS versus competitor audit. Major findings included:

- Broken starter identification
- Double minutes punishment
- Mixed projection methods
- Overgenerous priors
- Weak stale-row checks
- Incomplete BPS and DefCon differentiation
- Correct repair order

Used in `02-RECOVERY-PLAN.md`, `04-XPTS-ARCHITECTURE.md`, and `06-KNOWN-FAILURES.md`.

### `ZEUS_XPTS_ONE_HOUR_MASTER_PLAN.md`

Historical staged repair plan and state tracker. It correctly identified that the earlier one-hour scope was too broad and prioritised structural integrity, minutes, player data, penalties, and automated validation.

Used as historical planning evidence, not as the current execution plan.

### Current recovery conversation

Used for:

- The user's chosen recovery order
- Full V2 product feature scope
- Repeated GitHub failure evidence
- Fixture `1000005` failure
- Tidy checksum failure
- Decision to use Codex as the primary coding executor

## Repository snapshot used

- Uploaded name: `zeus-main (1)(1).zip`
- Date supplied: 31 July 2026
- The ZIP had no `.git` directory

## What was deliberately not included

Raw chat transcripts were not copied into the repository because they contain:

- Repeated assistant claims later disproved
- Superseded requirements
- Duplicate context
- Emotional exchanges unrelated to implementation
- Contradictory version instructions

Durable requirements and evidence were extracted into the canonical files instead.
