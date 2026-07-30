# ZEUS Live xPTS Validation

**Release status: FAIL**
Generated: 2026-07-30T18:50:35.316Z

## Release gates

- **FAIL: Every team has 11 expected starters**  
  10 to 12
- **FAIL: Every team has one expected starting goalkeeper**  
  0 to 2
- **FAIL: Every team reconciles to 990 expected minutes**  
  900 to 1080, mean 989.64
- **PASS: Unavailable players receive zero**  
  0 failures
- **PASS: GW1 predicted starters are locked at 100%**  
  214 starters, 0 failures
- **FAIL: GW1 non-starters have zero start probability**  
  292 non-starters, 53 failures
- **PASS: Every active player has an engine projection**  
  0 missing engine rows
- **PASS: Established players no longer fall onto broad positional priors**  
  0 players with 20+ historical nineties remain on a broad prior
- **FAIL: No starter-level xPTS is assigned below 35 minutes**  
  1 players at 3.5+ xPTS below 35 minutes
- **PASS: Player probabilities are internally coherent**  
  0 probability failures
- **PASS: Players receive no events while expected to play zero minutes**  
  0 failures
- **FAIL: Player expected goals conserve each team's expected goals**  
  2 teams outside 5%
- **PASS: Virgil has starter-level GW1 minutes**  
  Virgil: 1 start, 90 minutes
- **PASS: Alisson has starter-level GW1 minutes**  
  A.Becker: 1 start, 90 minutes
- **PASS: Matheus Nunes has starter-level GW1 minutes**  
  Matheus N.: 1 start, 87.3 minutes
- **PASS: Palmer projects above Neto**  
  3.889 vs 3.747
- **PASS: Palmer projects above Caicedo**  
  3.889 vs 3.196
- **PASS: Saka projects above Rice**  
  6.364 vs 5.702
- **PASS: Haaland separates from Watkins**  
  6.778 vs 4.907, gap 1.871

## Named-player output

| Player | xPTS | xMins | Start | xG | Pen xG | xA | Bonus | DEFCON | Rate source |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Haaland (MCI) | 6.778 | 86.3 | 100.0% | 0.757 | 0.000 | 0.180 | 1.273 | 0.006 | understat|role:complete_forward |
| Watkins (AVL) | 4.907 | 82.0 | 100.0% | 0.478 | 0.000 | 0.075 | 0.897 | 0.004 | understat|role:complete_forward |
| Palmer (CHE) | 3.889 | 78.8 | 100.0% | 0.233 | 0.000 | 0.116 | 0.285 | 0.048 | understat|role:attacking_midfielder |
| Neto (CHE) | 3.747 | 81.6 | 100.0% | 0.169 | 0.000 | 0.207 | 0.220 | 0.013 | archive-expected|role:attacking_creator |
| Caicedo (CHE) | 3.196 | 86.0 | 100.0% | 0.053 | 0.000 | 0.105 | 0.093 | 0.371 | archive-expected|role:holding_midfielder |
| Saka (ARS) | 6.364 | 82.4 | 100.0% | 0.376 | 0.000 | 0.381 | 0.568 | 0.113 | understat|role:attacking_creator |
| Rice (ARS) | 5.702 | 87.7 | 100.0% | 0.171 | 0.000 | 0.373 | 0.358 | 0.410 | understat|role:creator_midfielder |
| Virgil (LIV) | 4.984 | 90.0 | 100.0% | 0.232 | 0.000 | 0.047 | 0.361 | 0.429 | understat|role:set_piece_defender |
| A.Becker (LIV) | 3.779 | 90.0 | 100.0% | 0.000 | 0.000 | 0.007 | 0.551 | 0.000 | archive-expected|role:goalkeeper |
| Matheus N. (MCI) | 4.334 | 87.3 | 100.0% | 0.043 | 0.000 | 0.180 | 0.228 | 0.152 | understat|role:attacking_defender |
| Gabriel (ARS) | 7.952 | 89.5 | 100.0% | 0.201 | 0.000 | 0.237 | 0.798 | 0.470 | understat|role:attacking_defender |

## Before and after

| Player | Before xPTS | After xPTS | Change | Before mins | After mins |
|---|---:|---:|---:|---:|---:|
| Haaland (MCI) | 6.189 | 6.778 | +0.589 | 79.0 | 86.3 |
| Watkins (AVL) | 4.452 | 4.907 | +0.455 | 84.6 | 82.0 |
| Palmer (CHE) | 3.043 | 3.889 | +0.846 | 73.2 | 78.8 |
| Neto (CHE) | 2.955 | 3.747 | +0.792 | 77.7 | 81.6 |
| Caicedo (CHE) | 3.597 | 3.196 | -0.401 | 79.5 | 86.0 |
| Saka (ARS) | 5.679 | 6.364 | +0.685 | 77.2 | 82.4 |
| Rice (ARS) | 5.636 | 5.702 | +0.066 | 83.5 | 87.7 |
| Virgil (LIV) | 1.798 | 4.984 | +3.186 | 32.2 | 90.0 |
| A.Becker (LIV) | 1.343 | 3.779 | +2.436 | 28.0 | 90.0 |
| Matheus N. (MCI) | 1.458 | 4.334 | +2.876 | 27.7 | 87.3 |
| Gabriel (ARS) | 6.669 | 7.952 | +1.283 | 81.9 | 89.5 |

## Whole-table audit

# ZEUS xPTS Automated Audit

Source: `live-projections.csv`
Rows: 564

## Structural gates

- **FAIL:** Team starts sum to 11
- **FAIL:** Goalkeeper starts sum to 1
- **FAIL:** Team expected minutes sum to 990 ±5
- **PASS:** Unavailable players are zero
- **PASS:** GW1 named starters have 100% start chance
- **FAIL:** GW1 non-starters have 0% start chance

## Data coverage

- Positional-prior players: **67 / 564 (11.9%)**
- Established players with 20+ historical nineties still on priors: **0**
- Players using a derived role-aware rate target: **389 / 564 (69%)**

## Watch players

| Player | Team | xPTS | xMins | P(start) | Route | Rate source | xG | xA | Bonus | DEFCON |
|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|
| Haaland | MCI | 6.778 | 86.3 | 1.000 | lineup-starter | understat|role:complete_forward | 0.757 | 0.180 | 1.273 | 0.006 |
| Watkins | AVL | 4.907 | 82.0 | 1.000 | lineup-starter | understat|role:complete_forward | 0.478 | 0.075 | 0.897 | 0.004 |
| Palmer | CHE | 3.889 | 78.8 | 1.000 | lineup-starter | understat|role:attacking_midfielder | 0.233 | 0.116 | 0.285 | 0.048 |
| Neto | CHE | 3.747 | 81.6 | 1.000 | lineup-starter | archive-expected|role:attacking_creator | 0.169 | 0.207 | 0.220 | 0.013 |
| Caicedo | CHE | 3.196 | 86.0 | 1.000 | lineup-starter | archive-expected|role:holding_midfielder | 0.053 | 0.105 | 0.093 | 0.371 |
| Saka | ARS | 6.364 | 82.4 | 1.000 | lineup-starter | understat|role:attacking_creator | 0.376 | 0.381 | 0.568 | 0.113 |
| Rice | ARS | 5.702 | 87.7 | 1.000 | lineup-starter | understat|role:creator_midfielder | 0.171 | 0.373 | 0.358 | 0.410 |
| Virgil | LIV | 4.984 | 90.0 | 1.000 | lineup-starter | understat|role:set_piece_defender | 0.232 | 0.047 | 0.361 | 0.429 |
| A.Becker | LIV | 3.779 | 90.0 | 1.000 | lineup-starter | archive-expected|role:goalkeeper | 0.000 | 0.007 | 0.551 | 0.000 |
| Matheus N. | MCI | 4.334 | 87.3 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.043 | 0.180 | 0.228 | 0.152 |
| Gabriel | ARS | 7.952 | 89.5 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.201 | 0.237 | 0.798 | 0.470 |

## Key comparisons

- **Haaland vs Watkins:** gap +1.871 xPTS; xG+xA 0.937 vs 0.553; minutes 86.3 vs 82.0
- **Palmer vs Neto:** gap +0.142 xPTS; xG+xA 0.349 vs 0.376; minutes 78.8 vs 81.6
- **Palmer vs Caicedo:** gap +0.693 xPTS; xG+xA 0.349 vs 0.158; minutes 78.8 vs 86.0
- **Saka vs Rice:** gap +0.662 xPTS; xG+xA 0.757 vs 0.544; minutes 82.4 vs 87.7

## Current failure counts

- High xPTS with under 35 minutes: **1**
- Under 2.2 xPTS with 70+ minutes: **21**

This report is generated after every projection change. A change is not accepted only because selected players look better; structural gates and whole-table comparisons must also improve.


## Blocking failures

- Every team has 11 expected starters: 10 to 12
- Every team has one expected starting goalkeeper: 0 to 2
- Every team reconciles to 990 expected minutes: 900 to 1080, mean 989.64
- GW1 non-starters have zero start probability: 292 non-starters, 53 failures
- No starter-level xPTS is assigned below 35 minutes: 1 players at 3.5+ xPTS below 35 minutes
- Player expected goals conserve each team's expected goals: 2 teams outside 5%
