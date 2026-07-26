> **DATES SUPERSEDED.** Every deadline in this document was rewritten on 26 Jul 2026.
> The binding schedule is `config/schedule.json` and `docs/DECISIONS.md` section 14:
> working MVP 26 Jul, complete project 28 Jul 22:00. Any date below is indicative only.

# Scoring formulas

Implemented in `lib/scoring.js`, tested in `tests/scoring.test.mjs`. Nothing here is hand-picked and
nothing returns a number when its inputs do not exist: an uncomputable score is `null` and the panel
renders nothing for it, per DECISIONS 2.1.

All scores are 0 to 100 and mean the same thing: **how close this squad is to the best that could be
assembled from the current pool.** 100 is the ceiling of what is available today, not a theoretical
maximum, so a score moves as the market moves.

## Line strength, per position

    lineStrength(pos) = 100 × mean(score of this squad's starters at pos)
                              ÷ mean(score of the top N scorers at pos in the pool)

N is how many starters the current shape uses at that position. It answers the question a weak line
actually raises: how much am I giving up against the best line I could have picked. Null when the
line has no starters.

## Overall squad score

    overall = Σ (lineStrength(pos) × starters(pos)) ÷ Σ starters(pos)

A starter-weighted mean of the line strengths, so five midfielders count more than one keeper.

Bench is excluded deliberately. Bench quality is reported separately as the bench floor; folding it
in here would let a strong bench hide a weak eleven.

Null until at least one line can be scored.

## Captaincy strength

    captaincyStrength = 100 × (best armband expected value in this squad)
                              ÷ (best armband expected value available in the pool)

The armband doubles one player, so the question is not whether the captain is good but how much is
being given up against the best captain that could be owned. Null when there is no eleven.

## Template alignment

    alignment = 100 × |my fifteen ∩ template fifteen| ÷ 15

The template fifteen is the most-owned legal fifteen, computed from live ownership in
`lib/data.js → templateSquad`.

**This is not higher-is-better.** At 100 the field owns the same squad, so out-scoring it is
arithmetically impossible and rank 1 is out of reach. At 0 the squad is pure variance. The useful
value sits between, and both sides are returned so the trade-off is visible:

- `missing` — template players not owned. Each is a way to fall behind.
- `unique` — players owned that the template does not have. Each is a way to gain.

**No target band is returned.** A band would have to come from what actually won in past seasons,
which needs manager pick data that no ingested source contains. Inventing one would be the kind of
non-discriminating metric that EXCLUSIONS 12.9 forbids. `zoneFitted: false` is returned and the
panel states plainly that the band arrives with the strategy study on 28 Julust.

The top-10k template is a separate input and is also unavailable: it needs the rival scraper,
ticket B-17.

## Club concentration

    clubs = distinct clubs across the fifteen
    max   = largest block from one club

Three from one club is the rule ceiling, so `max` is flagged rather than merely counted.

## Bands

    90 and above  near the ceiling   green
    75 to 89      solid              white
    below 75      below what is available   pink

Bands are cut on the score, not on position or price.
