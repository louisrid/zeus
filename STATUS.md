# FPLBot — current state, 31 Jul 2026

Goal: world rank one, 2026/27. Desktop only, private, no login.

## Release Check V5

The exact V4 GitHub run passed dependency installation, 527 tests, CSS validation, the real Next.js production build, configuration, data refresh, projection generation and the xPTS release gate. It failed live because the projection job selected GW1-GW8 but silently skipped 70 odds-free future fixtures and persisted only 564 GW1 rows. V4 also ran repository cleanup after that live failure, which was unsafe.

V5 replaces that path with a new manual workflow: `.github/workflows/zeus-release-check-v5.yml` (`ZEUS Release Check V5`). Odds-free fixtures now resolve through overall team strength, venue-specific attack/defence ratings, or an explicit neutral league fallback. A fixture can no longer disappear through `continue`. Before any database write, the run proves that every selected fixture was simulated and every active player has one row in each of all 38 gameweeks. After the write, it independently proves that Supabase contains the exact expected row count for the complete GW1-GW38 season and that every row belongs to the same projection attempt.

Live verification checks every gameweek from GW1 through GW38. Destructive repository cleanup is permitted only after the complete live verification passes, and the staged cleanup must pass preflight, the complete test suite and the production build before it can be committed.

Local verification for the final V5 source package: 554 complete tests passed with the repository's import-only Supabase test stub; source preflight passed before and after the exact cleanup; all changed JavaScript parsed; workflow YAML passed duplicate-key validation; and all 16 workflow Bash blocks passed syntax checks. The post-write Supabase verifier paginates until an empty page, proves the exact timestamped row count for every gameweek, removes stale generations only after structural completeness is established, and re-reads the table after cleanup. An offline integration test exercised eight gameweeks, short server-capped pages, 800 mixed current/stale rows, and retained exactly the 400 current rows.

The release action also prevents a second manual click from cancelling an active database write, writes each gameweek as an isolated Supabase batch, generates and validates a package lock on the first successful run, and uses `npm ci` thereafter. It normalises both retained production projection workflows to the complete 38-gameweek season, raises their timeout to 90 minutes, and keeps structural failures blocking while fixture-sensitive football-quality flags remain warnings. The self-contained patch carries the tested Players, Builder and Squad UI files. Builder controls stay on one row only where space genuinely permits, while the pitch and player panel stack before the fixed sidebar can force clipping. Named regression checks protect the Gomes, Lavia and Osula failure modes. All permanent workflow, lockfile and cleanup changes are committed only after complete live verification passes. A fresh local production build is not claimed because this environment cannot install the real Supabase package. The exact V4 GitHub environment did complete the real Next.js build, and V5 performs a new real install, full test suite and build before touching production data.

## Core Restoration V3

The current release candidate restores the product features that regressed after the engine rebuild:

- Eight live projection gameweeks rather than GW1 only.
- A working gameweek range on Players.
- One shared GW range on Builder, defaulting to the next four gameweeks.
- Builder squad construction, improvement and XI optimisation all use that exact range.
- A persistent `OPTIMISE GW` action on Squad.
- Projection-backed current-club resolution for transferred players.
- Safer starter-minute handling for tiny historical samples.
- Safer role assignment for low-sample forwards.


V2 failed before the build because one test inspected unrelated legacy workflow files that Mac had skipped. The engine itself already enforced eight gameweeks. V3 removes that false dependency and validates the actual runtime guarantee plus its own unique workflow.

The restored Builder and Squad action bars use the existing ZEUS visual language and stay on one line on wide desktop layouts, then wrap predictably at narrower widths. The manual release action is uniquely named `ZEUS Core Restoration V3` and writes fresh logs for every stage, so an old committed report cannot masquerade as the result of a failed run.

Local verification: 519/519 tests passed, the V3 source preflight passed, the exact hidden-workflow-skip state also passed 519/519, changed JavaScript and JSX parsed successfully, and all workflow YAML parsed. The production Next.js build and live Supabase/Vercel checks remain part of the manual GitHub action because the local execution environment cannot install the real npm dependencies.

**`docs/DECISIONS.md` is the binding contract.** Where anything disagrees with it, that file wins.
This page is the plain-language state of things. Two older documents, `docs/tickets.md` and
`docs/campaign-plan.md`, are historical: they describe a build order and an interaction model that have
both since changed, and they should not be read as current.

## Pages

| Page | What it does |
|---|---|
| Dashboard | Most-owned XV, deadline countdown, jump-off points. "Edit this as a draft" seats the template in the Builder |
| Builder | Build a fifteen. Best XI and Rebuild All, locks, exclusions, shortlist, undo, shape lock, horizon 1 to 8 gameweeks |
| Squad | Every saved plan as a formation card, with slot one reserved for the live team. Open a plan for its gameweek timeline |
| Players | Every player, continuous filters, any GW1-GW38 range, value, ownership and price |
| Projections | Complete per-gameweek and cumulative xPTS table with CSV export |
| Fixtures | Full GW1-GW38 fixture table with club, blank and double filters |

| Line-ups | Two clubs side by side, predicted eleven from the minutes model |
| News | Noticed, as a card grid, and price moves |
| Status | Pipeline readiness plus all model diagnostics under Model Evidence |

## What the projection actually is

xPTS per player per fixture from one joint match-simulation engine. Missing player evidence is converted into player, role, team or position inputs before simulation. The website no longer manufactures a separate final xPTS through archive or positional fallbacks.

The current active generation passed the live structural gate with 564 of 564 active players covered, exactly 11 expected starters and 990 expected player-minutes per club, one goalkeeper per club and complete team-goal conservation.

## What is proven and what is not

**Proven in production:** one complete current engine generation, coherent GW1 lineups, minutes and goalkeeper selection, non-zero fallback inputs, player-level attacking-rate coverage, penalty-share plumbing, probability coherence and team-goal conservation. These are enforced by a failing release gate.

**Not yet proven:** future predictive accuracy against played 2026/27 gameweeks. Several calibration values remain interim and must continue to be judged on unseen data rather than by whether individual names look attractive.

Honest description: a coherent, instrumented projection engine with a clean live pipeline. It is not declared the world's best predictor until real holdout results prove that claim.

## Rules encoded, verified July 2026

One free transfer a gameweek, banking to five. Four points a hit. Two chip sets, one per half, the
first expiring at the GW19 deadline. Banked transfers survive a chip. Sale value is purchase price plus
half of any rise, rounded down.

## Cost

Budget cap $17/month. Current spend is Supabase and Vercel free tiers plus The Odds API. No AI runs in
the app: the presser job is the only AI call, and Copy payload is how a squad reaches an assistant.

## Housekeeping

The manual `ZEUS Release Check V5` workflow validates the source, runs the full tests and production build, generates and proves the complete 38-gameweek Supabase horizon, verifies the deployed Players, Builder, Squad and OpenWeb paths, then removes only the obsolete workflows and stale release evidence listed in `config/repository-cleanup-paths.txt`.

## Terminology

xPTS (projected points), x£ (expected price), VALUE (xPTS per million), OWNERSHIP %, GAMETIME %,
PTS LAST YEAR, FORM, DIFFICULTY. A saved fifteen is a DRAFT; a transfer plan built on one is a PLAN.
Analysis is archived: the route resolves but it is out of the nav, and its diagnostics are on Status.

## Tuning the model

Eight values that shape a projection are parameters rather than fixed judgements: the weight on recent form,
the window that counts as recent, chances against goals actually scored, how hard a fixture pushes, how much
an unproven player regresses toward his own team-mates, how bonus scales with underlying output, how much of
the promoted-club discount to apply, and how sharply a rotation risk falls. They live in
`lib/solver/tuning.mjs` with a stated search range each.

Every one defaults to the setting the model already used, so nothing moves until something is proved. A value
is only read by the app once it is marked MEASURED in `config/fitted-params.json`, and only the `sweep`
workflow writes that mark.

The sweep searches in two stages, because a parameter can only be measured where it has an effect. The seven
points parameters are judged on players who started, where the points model is what is being tested. The
rotation parameter is judged on every player with a fixture, because with minutes held certain it does nothing
at all. Every change then has to survive a paired bootstrap: whole gameweeks are redrawn a few hundred times
and the change has to keep winning, or it is reverted to its default and recorded as not measured. A parameter
nothing can move is reported as untested rather than rejected.

The band correction is fitted on the tuning seasons only, forced to rise so it can resize a projection but
never reorder two players, and kept only if it shrinks the gap in the band where transfer decisions are made.

The first run of this got three things wrong and each is now held by a test: it measured the population where
whether a player features swamps everything else, it applied values that moved ordering by less than a
thousandth, and its correction never reached the band it existed to fix.
