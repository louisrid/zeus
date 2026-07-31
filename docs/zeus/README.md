# ZEUS Context Pack

This folder is the current handoff for Codex and any future coding agent.

It was created from:

- The cleaned ZEUS repository snapshot supplied on 31 July 2026
- The current recovery conversation
- The detailed competitor-system analysis
- The historical ZEUS engine analysis
- The ZEUS versus competitor audit
- The one-hour xPts repair plan
- Existing repository documentation

## Read order

1. `00-PROJECT-BRIEF.md`
2. `01-CURRENT-STATE.md`
3. `07-DECISIONS.md`
4. `02-RECOVERY-PLAN.md`
5. `08-ACCEPTANCE-CRITERIA.md`
6. `03-V2-PRODUCT-SCOPE.md`
7. `04-XPTS-ARCHITECTURE.md`
8. `05-COMPETITOR-SYSTEM.md`
9. `06-KNOWN-FAILURES.md`
10. `09-ACTIVE-TASKS.md`
11. `10-SOURCE-INDEX.md`
12. `11-CODEX-FIRST-TASK.md`

## Important distinction

These files describe both:

- The product ZEUS is intended to become
- The repository state that actually exists now

They do not claim that the current repository is fully working. The current state is explicitly recorded in `01-CURRENT-STATE.md`.

## Updating this pack

After every accepted pull request:

- Update `01-CURRENT-STATE.md`
- Update `09-ACTIVE-TASKS.md`
- Add any new permanent decision to `07-DECISIONS.md`
- Add any newly discovered failure pattern to `06-KNOWN-FAILURES.md`

Do not use old chats as the live task tracker.
