# Permanent model exclusions

These are ruled out of v1 and v2 permanently. This file exists so they cannot be reintroduced
later by someone who does not know why they were excluded. If a proposed layer appears on this
list, it does not get built, regardless of how well it appears to perform in a backtest.

## 1. Double-counting the market

**Team form and home advantage must never receive their own adjustment layer.**

Bookmaker odds already price both. Adding a form multiplier or a home-advantage bump on top of
odds-derived goal expectations counts the same signal twice, which inflates confidence without
adding information and biases every downstream projection in the same direction.

Where home advantage legitimately appears:

- Inside the odds themselves, which is where it belongs.
- As the ±0.08 venue term in the opponent-strength display scale, which is a UI ranking device
  used only when odds are unavailable, and is never fed back into the projection engine.

Anything else touching form or venue on top of the market is excluded.

## 2. Human intent and psychology

Nothing in the model may require predicting what a person intends to do. Excluded specifically:

- Manager-change handling. No "new manager bounce", no regime-change adjustment.
- Managerial-style modelling. No tactical-preference or philosophy priors.
- Motivation and stakes modelling. No relegation-battle, title-race, dead-rubber or
  European-qualification effects.
- Rotation-intent guessing. Rotation may only be modelled from observed historical patterns of
  actual minutes. Inferring what a manager plans to do is excluded.

The model works from observed data and market prices. Nothing else.

## 3. Why this matters for rank 1

Both categories share a failure mode: they are easy to fit in-sample and unfalsifiable
out-of-sample. They generate confident-looking numbers that cannot be checked against anything,
which is precisely the kind of edge that does not survive contact with a full season.
