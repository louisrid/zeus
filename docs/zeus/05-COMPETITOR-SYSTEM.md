# Competitor System: FPL Copilot Reference

## Purpose

This document records the competitor system that was analysed for ZEUS. It is a reference architecture and comparison target, not a specification to copy exactly.

The competitor analysis is important because it exposes how a strong projection product separates:

- Team-level fixture strength
- Player-level allocation
- Expected minutes
- FPL scoring components
- Transfer optimisation

## 1. Two separate systems

FPL Copilot appears to combine two independent layers.

### Projection model

Produces player and fixture projections:

- Expected minutes
- Expected goals
- Expected penalty goals
- Expected assists
- Clean-sheet probability
- Goals-conceded deductions
- Saves
- Defensive-contribution points
- Bonus
- Cards
- Final xPts

### Transfer solver

Uses completed projections to optimise:

- Transfers
- Hits
- Starting XI
- Captaincy
- Squad construction
- Multi-gameweek plans
- Potential chip timing

The solver does not create the football projections. ZEUS should preserve the same conceptual separation even if its algorithms differ.

## 2. Captured competitor data

The analysis included several API output types.

### Player summary

Approximately 555 players with fields such as:

- Player ID and name
- Position and team
- Price and ownership
- Total points
- Expected goals per 90
- Expected assists per 90
- Defensive contribution per 90
- Saves per 90
- Per-gameweek expected minutes
- Per-gameweek xPts

A captured Haaland example showed:

- 0.78 expected goals per 90
- 0.08 expected assists per 90
- 87.8 projected minutes
- 7.66 GW1 xPts
- 282.85 season xPts

The season total appeared to be the sum of the 38 gameweek projections.

### Component matrix

Per-player, per-gameweek fields included:

- Goals
- Assists
- Clean-sheet component
- DefCon
- Bonus
- Saves
- Appearance
- Base minutes

These fields mix event expectations, probabilities, and points components. They are not all raw points.

### Detailed player output

Detailed responses for Haaland, Mbeumo, and Guéhi exposed:

- Model version and run ID
- Fixture ID
- Opponent and home/away status
- Team xG and opponent xG
- FDR
- Expected minutes
- Expected goals
- Expected penalty goals
- Expected assists
- Individual points components
- Final xPts

### Penalty data

The penalty endpoint exposed:

- Ranked takers
- Taker shares
- Team penalty parameters
- Team rosters
- User overrides

Examples included full shares for Haaland and Palmer and a split between Gyökeres and Saka.

## 3. Reconstructed competitor pipeline

The strongest reconstruction is:

```text
Historical team and player data
        -> team attack and defence strength
        -> fixture team_xg and opp_xg
        -> player expected minutes
        -> allocation of team attacking output
        -> penalty allocation
        -> clean sheets, saves, DefCon, bonus, and cards
        -> FPL points conversion
        -> final player xPts
        -> separate transfer solver
```

## 4. Team and opponent strength

For every fixture, the model produces:

- `team_xg`
- `opp_xg`

These are the real quantitative fixture projections.

A shared Manchester derby example reversed exactly between the two teams:

- Manchester City `team_xg` matched Manchester United `opp_xg`
- Manchester United `team_xg` matched Manchester City `opp_xg`

This proves that player projections begin from one fixture-level expected scoreline.

A likely underlying structure is:

```text
log(team xG) =
league baseline
+ team attacking strength
- opponent defensive strength
+ home advantage
+ adjustments
```

Possible adjustments include recency, previous-season priors, promoted-team priors, injuries, squad changes, and home-away splits.

FDR is not the core strength model. It is a separate display or classification value. `team_xg` and `opp_xg` are the important quantitative outputs.

## 5. Team xG is allocated to players

This was one of the strongest findings.

For captured teams and fixtures, the sum of player expected goals closely matched the API's team xG after rounding.

Examples included:

- Manchester City GW1 player xG total approximately 2.740 versus team xG 2.737
- Manchester United GW1 player xG total approximately 2.166 versus team xG 2.163

The likely process is:

1. Forecast team goals.
2. Allocate that total among expected players.

The allocation appears to depend on:

- Player xG per 90
- Expected minutes
- Role
- Penalty duty
- Fixture context
- Priors and smoothing for small samples

Players with zero listed xG rate still sometimes received non-zero projected xG, indicating fallback priors or shrinkage.

## 6. Penalties are separated

Detailed output exposes penalty expected goals separately.

Haaland GW1 example:

- Total expected goals: 0.952
- Penalty expected goals: 0.1399
- Approximate non-penalty expected goals: 0.8121

Penalty xG changed by fixture, so it was not a fixed player constant.

Likely structure:

```text
player penalty xG =
team expected penalty events
x fixture adjustment
x taker share
x conversion probability
```

ZEUS should keep penalties separate from open-play allocation and preserve the identity of the sampled taker.

## 7. Assists are allocated separately

The sum of player expected assists was lower than team expected goals, which is sensible because not every goal has an FPL assist.

Likely inputs:

- xA per 90
- Chance creation
- Set pieces
- Expected minutes
- Role
- Assistable-goal share

ZEUS should not force total player xA to equal total team goals.

## 8. Expected minutes and appearance points

The competitor appears to model a minutes distribution, not just one expected-minute number.

The correct appearance structure is conceptually:

```text
appearance points =
1 x P(plays 1 to 59 minutes)
+ 2 x P(plays 60 or more minutes)
```

That requires estimates for:

- No appearance
- Start
- Substitute appearance
- Reaching 60 minutes
- Expected substitution time

In the captured preseason run, player expected minutes were stable across fixtures, suggesting a player-level baseline before deadline team-news updates.

The front-end manual minutes override scaled xPts approximately in proportion to new minutes divided by original minutes. That UI shortcut should not be confused with the backend appearance model.

## 9. FPL component conversion

### Goals

Expected goals are multiplied by position scoring:

- Forward: 4 points per goal
- Midfielder: 5
- Defender or goalkeeper: 6

### Assists

Expected assists are multiplied by 3.

### Appearance

Derived probabilistically from the minutes distribution.

### Clean sheets

Uses player-adjusted probability and position points. It does not appear to be a simple `exp(-opp_xg)` conversion in every fixture.

### Goals conceded

Applied as an expected deduction for defenders and goalkeepers.

### DefCon

The API appears to represent the probability or expected value of achieving the defensive-contribution threshold.

### Saves

Goalkeeper save expectation converts through the FPL save-point bands.

### Bonus

Expected bonus is separately modelled and varies materially with player and fixture context.

### Cards

Expected deductions show a possible home-away adjustment in the captured sample.

## 10. Worked examples

### Haaland GW1

Fixture context:

- Manchester City home to Bournemouth
- Team xG: 2.737
- Opponent xG: 1.416
- Expected minutes: 87.8
- Expected goals: 0.952
- Expected penalty goals: 0.1399
- Expected assists: 0.231

Points components:

| Component | Points |
|---|---:|
| Appearance | 1.9656 |
| Goals | 3.8082 |
| Assists | 0.6925 |
| DefCon | 0.0033 |
| Bonus | 1.3029 |
| Cards | -0.1125 |
| Total | 7.6600 |

### Mbeumo GW1

Context:

- Manchester United away
- Team xG: 2.163
- Opponent xG: 0.813
- Expected minutes: 85.9
- Expected goals: 0.345
- Expected assists: 0.254

Points components:

| Component | Points |
|---|---:|
| Appearance | 1.9644 |
| Goals | 1.7240 |
| Assists | 0.7618 |
| Clean sheet | 0.4008 |
| DefCon | 0.0204 |
| Bonus | 0.5772 |
| Cards | -0.1587 |
| Total | 5.2899 |

### Guéhi GW1

Context:

- Expected minutes: 89.0
- Expected goals: 0.084
- Expected assists: 0.083

Points components:

| Component | Points |
|---|---:|
| Appearance | 1.9678 |
| Goals | 0.5041 |
| Assists | 0.2488 |
| Clean sheet | 1.3661 |
| Goals conceded | -0.2698 |
| DefCon | 0.3485 |
| Bonus | 0.3314 |
| Cards | -0.1770 |
| Total | 4.3199 |

These examples prove that the displayed total can be exactly reconstructed once the component outputs are known.

## 11. Clean-sheet calibration

Competitor clean-sheet probabilities did not consistently equal `exp(-opp_xg)`.

This suggests one of:

- Separately trained clean-sheet model
- Calibrated scoreline distribution
- Dixon-Coles adjustment
- Negative-binomial or zero-inflated model
- Additional defensive features

ZEUS should not assume a simple Poisson clean-sheet conversion is sufficient without calibration.

## 12. Bonus model

The competitor bonus component appears player- and fixture-specific.

A strong independent version should simulate or model:

- Goals and assists
- Multiple returns
- Scoreline
- Minutes
- Position
- Saves
- Clean sheets
- Defensive actions
- Cards
- Teammate and opponent BPS competition

The best ZEUS route is likely full match-level BPS simulation rather than a broad positional constant.

## 13. Cards

The captured examples showed away card deductions roughly 21% larger than home deductions for three players.

This is suggestive, not fully proven.

A sensible independent card model could use:

- Historical card rate
- Expected minutes
- Home-away factor
- Opponent or match-intensity context

## 14. Double and uncertain fixtures

The detailed schema included:

- Number of fixtures
- Fixture list
- Fixture probability

This supports:

- Double gameweeks
- Blanks
- Unconfirmed rearrangements
- Probabilistic fixture inclusion

Conceptually:

```text
gameweek xPts = sum(fixture xPts x fixture probability)
```

ZEUS should preserve this architecture even if the first stable implementation handles only confirmed fixtures.

## 15. Confirmed versus inferred

### Confirmed directly from captured outputs

- Separate projection and optimisation systems
- Team xG and opponent xG per fixture
- Player expected minutes
- Player expected goals and assists
- Separate penalty expected goals
- Component-level expected points
- Final xPts as the sum of components
- Penalty shares
- Multi-fixture schema
- Player xG totals approximately conserve to team xG

### Strongly inferred

- Dynamic team attack and defence model
- Role and small-sample priors
- Player minutes distribution
- Separate clean-sheet calibration
- Match-aware bonus model
- Home-away card adjustment

### Still unknown

- Original training data
- Exact attack and defence coefficients
- Exact recency weights
- Exact minutes model
- Exact clean-sheet model
- Exact bonus method
- Exact player-allocation priors

## 16. What ZEUS should adopt

- Clean separation between projection and transfer solver
- Team-level goal environment before player allocation
- Explicit player expected-minutes distribution
- Separate open-play and penalty expected goals
- Component-level xP evidence
- Team-output conservation checks
- Separate clean-sheet calibration
- Full BPS competition
- Fixture-probability architecture
- Visible run and model provenance

## 17. What ZEUS should not copy blindly

- Hidden coefficients without independent validation
- FDR as a substitute for quantitative opponent strength
- Front-end linear minutes scaling as the true backend model
- Any clean-sheet formula inferred from a small sample
- Any home-away card multiplier inferred from only three players
- A solver design before projection stability
- Competitor outputs as training truth without checking real outcomes

## 18. Where ZEUS can retain an original advantage

ZEUS can use the competitor as a reference while keeping its own simulation-led approach.

Potential advantages:

- Better deadline-specific predicted-line-up and minutes resolution
- Market-informed team goal environments
- Transparent role and small-sample priors
- Full match-level event and BPS simulation
- Correct on-pitch timing for clean sheets and goals conceded
- Explicit uncertainty and percentile outputs
- Frozen pre-deadline historical backtesting
- One coherent pipeline for every player
- Stronger current-club and transfer identity handling

## 19. Competitor completeness assessment

The analysis judged:

- Reproduction of displayed xPts from API components: essentially complete
- Understanding of general architecture: high
- Independent reproduction from raw football data: partial

The largest hidden upstream systems are:

1. Team attack and defence model
2. Expected-minutes model
3. Player allocation priors
4. Clean-sheet calibration
5. Bonus model

The competitor should be used as a structured benchmark, not copied as an opaque authority.
