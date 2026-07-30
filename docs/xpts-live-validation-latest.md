# ZEUS Live xPTS Validation

**Release status: FAIL**
Generated: 2026-07-30T19:06:30.741Z

## Release gates

- **PASS: Every team has 11 expected starters**  
  11 to 11
- **PASS: Every team has one expected starting goalkeeper**  
  1 to 1
- **PASS: Every team reconciles to 990 expected minutes**  
  990 to 990, mean 990
- **PASS: Unavailable players receive zero**  
  0 failures
- **PASS: GW1 predicted starters are locked at 100%**  
  214 starters, 0 failures
- **FAIL: GW1 non-starters have zero start probability**  
  292 non-starters, 5 failures
- **PASS: Every active player has an engine projection**  
  0 missing engine rows
- **PASS: Established players no longer fall onto broad positional priors**  
  0 players with 20+ historical nineties remain on a broad prior
- **PASS: No starter-level xPTS is assigned below 35 minutes**  
  0 players at 3.5+ xPTS below 35 minutes
- **PASS: Player probabilities are internally coherent**  
  0 probability failures
- **PASS: Players receive no events while expected to play zero minutes**  
  0 failures
- **PASS: Player expected goals conserve each team's expected goals**  
  0 teams outside 5%
- **PASS: Virgil has starter-level GW1 minutes**  
  Virgil: 1 start, 90 minutes
- **PASS: Alisson has starter-level GW1 minutes**  
  A.Becker: 1 start, 90 minutes
- **PASS: Matheus Nunes has starter-level GW1 minutes**  
  Matheus N.: 1 start, 87.3 minutes
- **PASS: Palmer projects above Neto**  
  3.788 vs 3.548
- **PASS: Palmer projects above Caicedo**  
  3.788 vs 3.231
- **PASS: Saka projects above Rice**  
  6.43 vs 5.747
- **PASS: Haaland separates from Watkins**  
  6.89 vs 4.991, gap 1.899

## Named-player output

| Player | xPTS | xMins | Start | xG | Pen xG | xA | Bonus | DEFCON | Rate source |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Haaland (MCI) | 6.890 | 86.3 | 100.0% | 0.777 | 0.040 | 0.183 | 1.313 | 0.009 | understat|role:complete_forward |
| Watkins (AVL) | 4.991 | 82.0 | 100.0% | 0.493 | 0.018 | 0.074 | 0.929 | 0.004 | understat|role:complete_forward |
| Palmer (CHE) | 3.788 | 78.8 | 100.0% | 0.217 | 0.019 | 0.096 | 0.256 | 0.045 | understat|role:attacking_midfielder |
| Neto (CHE) | 3.548 | 81.6 | 100.0% | 0.139 | 0.000 | 0.176 | 0.177 | 0.011 | archive-expected|role:attacking_creator |
| Caicedo (CHE) | 3.231 | 86.0 | 100.0% | 0.046 | 0.000 | 0.086 | 0.080 | 0.401 | archive-expected|role:holding_midfielder |
| Saka (ARS) | 6.430 | 82.4 | 100.0% | 0.393 | 0.021 | 0.370 | 0.580 | 0.118 | understat|role:attacking_creator |
| Rice (ARS) | 5.747 | 87.7 | 100.0% | 0.186 | 0.011 | 0.357 | 0.381 | 0.409 | understat|role:creator_midfielder |
| Virgil (LIV) | 4.970 | 90.0 | 100.0% | 0.232 | 0.000 | 0.042 | 0.354 | 0.432 | understat|role:set_piece_defender |
| A.Becker (LIV) | 3.808 | 90.0 | 100.0% | 0.000 | 0.000 | 0.007 | 0.571 | 0.000 | archive-expected|role:goalkeeper |
| Matheus N. (MCI) | 4.398 | 87.3 | 100.0% | 0.044 | 0.000 | 0.180 | 0.241 | 0.148 | understat|role:attacking_defender |
| Gabriel (ARS) | 7.954 | 89.5 | 100.0% | 0.204 | 0.000 | 0.223 | 0.801 | 0.476 | understat|role:attacking_defender |

## Before and after

| Player | Before xPTS | After xPTS | Change | Before mins | After mins |
|---|---:|---:|---:|---:|---:|
| Haaland (MCI) | 6.189 | 6.890 | +0.701 | 79.0 | 86.3 |
| Watkins (AVL) | 4.452 | 4.991 | +0.539 | 84.6 | 82.0 |
| Palmer (CHE) | 3.043 | 3.788 | +0.745 | 73.2 | 78.8 |
| Neto (CHE) | 2.955 | 3.548 | +0.593 | 77.7 | 81.6 |
| Caicedo (CHE) | 3.597 | 3.231 | -0.366 | 79.5 | 86.0 |
| Saka (ARS) | 5.679 | 6.430 | +0.751 | 77.2 | 82.4 |
| Rice (ARS) | 5.636 | 5.747 | +0.111 | 83.5 | 87.7 |
| Virgil (LIV) | 1.798 | 4.970 | +3.172 | 32.2 | 90.0 |
| A.Becker (LIV) | 1.343 | 3.808 | +2.465 | 28.0 | 90.0 |
| Matheus N. (MCI) | 1.458 | 4.398 | +2.940 | 27.7 | 87.3 |
| Gabriel (ARS) | 6.669 | 7.954 | +1.285 | 81.9 | 89.5 |

## Whole-table audit

# ZEUS xPTS Automated Audit

Source: `live-projections.csv`
Rows: 564

## Structural gates

- **PASS:** Team starts sum to 11
- **PASS:** Goalkeeper starts sum to 1
- **PASS:** Team expected minutes sum to 990 ±5
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
| Haaland | MCI | 6.890 | 86.3 | 1.000 | lineup-starter | understat|role:complete_forward | 0.777 | 0.183 | 1.313 | 0.009 |
| Watkins | AVL | 4.991 | 82.0 | 1.000 | lineup-starter | understat|role:complete_forward | 0.493 | 0.074 | 0.929 | 0.004 |
| Palmer | CHE | 3.788 | 78.8 | 1.000 | lineup-starter | understat|role:attacking_midfielder | 0.217 | 0.096 | 0.256 | 0.045 |
| Neto | CHE | 3.548 | 81.6 | 1.000 | lineup-starter | archive-expected|role:attacking_creator | 0.139 | 0.176 | 0.177 | 0.011 |
| Caicedo | CHE | 3.231 | 86.0 | 1.000 | lineup-starter | archive-expected|role:holding_midfielder | 0.046 | 0.086 | 0.080 | 0.401 |
| Saka | ARS | 6.430 | 82.4 | 1.000 | lineup-starter | understat|role:attacking_creator | 0.393 | 0.370 | 0.580 | 0.118 |
| Rice | ARS | 5.747 | 87.7 | 1.000 | lineup-starter | understat|role:creator_midfielder | 0.186 | 0.357 | 0.381 | 0.409 |
| Virgil | LIV | 4.970 | 90.0 | 1.000 | lineup-starter | understat|role:set_piece_defender | 0.232 | 0.042 | 0.354 | 0.432 |
| A.Becker | LIV | 3.808 | 90.0 | 1.000 | lineup-starter | archive-expected|role:goalkeeper | 0.000 | 0.007 | 0.571 | 0.000 |
| Matheus N. | MCI | 4.398 | 87.3 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.044 | 0.180 | 0.241 | 0.148 |
| Gabriel | ARS | 7.954 | 89.5 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.204 | 0.223 | 0.801 | 0.476 |

## Key comparisons

- **Haaland vs Watkins:** gap +1.899 xPTS; xG+xA 0.960 vs 0.567; minutes 86.3 vs 82.0
- **Palmer vs Neto:** gap +0.240 xPTS; xG+xA 0.313 vs 0.315; minutes 78.8 vs 81.6
- **Palmer vs Caicedo:** gap +0.557 xPTS; xG+xA 0.313 vs 0.132; minutes 78.8 vs 86.0
- **Saka vs Rice:** gap +0.683 xPTS; xG+xA 0.763 vs 0.543; minutes 82.4 vs 87.7

## Current failure counts

- High xPTS with under 35 minutes: **0**
- Under 2.2 xPTS with 70+ minutes: **18**

This report is generated after every projection change. A change is not accepted only because selected players look better; structural gates and whole-table comparisons must also improve.


## Blocking failures

- GW1 non-starters have zero start probability: 292 non-starters, 5 failures
