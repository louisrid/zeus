# FPLBot — current state, 27 Jul 2026

Goal: world rank one, 2026/27. Desktop only, private, no login.

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
| Players | Every player, continuous filters, sortable on xP next, xP next 5, value, ownership, price, X£ |

| Line-ups | Two clubs side by side, predicted eleven from the minutes model |
| News | Noticed, as a card grid, and price moves |
| Status | Pipeline readiness plus all model diagnostics under Model Evidence |

## What the projection actually is

xPTS per player per fixture. Sources in order: the simulation engine where it has projected that
gameweek, otherwise last season's rate shrunk toward the position mean and adjusted for fixture
strength, availability and expected minutes. Promoted-club players carry a fitted factor.

**Every gameweek is anchored on one estimate**, so the series has no cliff between the engine's window
and beyond it.

## What is proven and what is not

**Proven:** the minutes model, 81.1% start accuracy and a Brier score of 0.125 against 0.202 for the
base rate. Squad legality and every FPL rule. Arithmetic and conservation, all under test.

**Not proven:** the engine has never been backtested against real gameweeks, because that needs
historical odds we do not have. Seventeen allocation and simulation parameters are interim. Clean-sheet
probability has never been calibrated and cannot be retro-calibrated; it accumulates from GW1.

Honest description: a correct, instrumented Tier 2 model. Not "the best predictor in the game", and it
will not be until the first backtest says so.

## Rules encoded, verified July 2026

One free transfer a gameweek, banking to five. Four points a hit. Two chip sets, one per half, the
first expiring at the GW19 deadline. Banked transfers survive a chip. Sale value is purchase price plus
half of any rise, rounded down.

## Cost

Budget cap $17/month. Current spend is Supabase and Vercel free tiers plus The Odds API. No AI runs in
the app: the presser job is the only AI call, and Copy payload is how a squad reaches an assistant.

## Housekeeping

Retired files cannot be deleted by upload, so they exist as inert stubs that declare themselves
RETIRED. The `tidy` workflow in the Actions tab removes them properly in one click.

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
