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
| Line-ups | Predicted eleven per club from the minutes model, with contested places and flagged players |
| Analysis | Football evidence only: position returns, value bands, promoted clubs |
| News | Injuries, price moves, press-conference signals, observations |
| Status | Pipeline readiness plus all model diagnostics under Model Evidence |

## What the projection actually is

xP per player per fixture. Sources in order: the simulation engine where it has projected that
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
