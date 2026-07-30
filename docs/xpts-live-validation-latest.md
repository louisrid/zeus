# ZEUS Live xPTS Validation

**Release status: PASS**
Generated: 2026-07-30T20:07:57.901Z

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
- **PASS: GW1 non-starters have zero start probability**  
  307 non-starters, 0 failures
- **PASS: Outfield fallback priors are non-zero**  
  0 zero-rate templates
- **PASS: No defender absorbs an implausible share of team attack**  
  0 concentration failures
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
  3.729 vs 3.493
- **PASS: Palmer projects above Caicedo**  
  3.729 vs 3.163
- **PASS: Saka projects above Rice**  
  6.359 vs 5.65
- **PASS: Haaland separates from Watkins**  
  6.66 vs 4.832, gap 1.828

## Named-player output

| Player | xPTS | xMins | Start | xG | Pen xG | xA | Bonus | DEFCON | Rate source |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Haaland (MCI) | 6.660 | 86.3 | 100.0% | 0.740 | 0.040 | 0.168 | 1.278 | 0.009 | understat|role:complete_forward |
| Watkins (AVL) | 4.832 | 82.0 | 100.0% | 0.465 | 0.018 | 0.067 | 0.905 | 0.004 | understat|role:complete_forward |
| Palmer (CHE) | 3.729 | 78.8 | 100.0% | 0.209 | 0.020 | 0.095 | 0.242 | 0.045 | understat|role:attacking_midfielder |
| Neto (CHE) | 3.493 | 81.6 | 100.0% | 0.135 | 0.000 | 0.167 | 0.169 | 0.010 | archive-expected|role:attacking_creator |
| Caicedo (CHE) | 3.163 | 86.0 | 100.0% | 0.040 | 0.000 | 0.081 | 0.069 | 0.399 | archive-expected|role:holding_midfielder |
| Saka (ARS) | 6.359 | 82.4 | 100.0% | 0.382 | 0.018 | 0.366 | 0.576 | 0.117 | understat|role:attacking_creator |
| Rice (ARS) | 5.650 | 87.7 | 100.0% | 0.175 | 0.011 | 0.347 | 0.365 | 0.412 | understat|role:creator_midfielder |
| Virgil (LIV) | 4.616 | 90.0 | 100.0% | 0.190 | 0.000 | 0.023 | 0.316 | 0.433 | understat|role:set_piece_defender |
| A.Becker (LIV) | 3.723 | 90.0 | 100.0% | 0.000 | 0.000 | 0.002 | 0.557 | 0.000 | archive-expected|role:goalkeeper |
| Matheus N. (MCI) | 4.323 | 87.3 | 100.0% | 0.041 | 0.000 | 0.162 | 0.240 | 0.147 | understat|role:attacking_defender |
| Gabriel (ARS) | 7.661 | 89.5 | 100.0% | 0.181 | 0.000 | 0.193 | 0.738 | 0.481 | understat|role:attacking_defender |

## Before and after

| Player | Before xPTS | After xPTS | Change | Before mins | After mins |
|---|---:|---:|---:|---:|---:|
| Haaland (MCI) | 6.189 | 6.660 | +0.471 | 79.0 | 86.3 |
| Watkins (AVL) | 4.452 | 4.832 | +0.380 | 84.6 | 82.0 |
| Palmer (CHE) | 3.043 | 3.729 | +0.686 | 73.2 | 78.8 |
| Neto (CHE) | 2.955 | 3.493 | +0.538 | 77.7 | 81.6 |
| Caicedo (CHE) | 3.597 | 3.163 | -0.434 | 79.5 | 86.0 |
| Saka (ARS) | 5.679 | 6.359 | +0.680 | 77.2 | 82.4 |
| Rice (ARS) | 5.636 | 5.650 | +0.014 | 83.5 | 87.7 |
| Virgil (LIV) | 1.798 | 4.616 | +2.818 | 32.2 | 90.0 |
| A.Becker (LIV) | 1.343 | 3.723 | +2.380 | 28.0 | 90.0 |
| Matheus N. (MCI) | 1.458 | 4.323 | +2.865 | 27.7 | 87.3 |
| Gabriel (ARS) | 6.669 | 7.661 | +0.992 | 81.9 | 89.5 |

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
- **PASS:** GW1 non-starters have 0% start chance
- **PASS:** Outfield positional priors are non-zero
- **PASS:** No defender absorbs an implausible share of team goals

## Data coverage

- Positional-prior players: **67 / 564 (11.9%)**
- Established players with 20+ historical nineties still on priors: **0**
- Players using a derived role-aware rate target: **389 / 564 (69%)**

## Watch players

| Player | Team | xPTS | xMins | P(start) | Route | Rate source | xG | xA | Bonus | DEFCON |
|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|
| Haaland | MCI | 6.660 | 86.3 | 1.000 | lineup-starter | understat|role:complete_forward | 0.740 | 0.168 | 1.278 | 0.009 |
| Watkins | AVL | 4.832 | 82.0 | 1.000 | lineup-starter | understat|role:complete_forward | 0.465 | 0.067 | 0.905 | 0.004 |
| Palmer | CHE | 3.729 | 78.8 | 1.000 | lineup-starter | understat|role:attacking_midfielder | 0.209 | 0.095 | 0.242 | 0.045 |
| Neto | CHE | 3.493 | 81.6 | 1.000 | lineup-starter | archive-expected|role:attacking_creator | 0.135 | 0.167 | 0.169 | 0.010 |
| Caicedo | CHE | 3.163 | 86.0 | 1.000 | lineup-starter | archive-expected|role:holding_midfielder | 0.040 | 0.081 | 0.069 | 0.399 |
| Saka | ARS | 6.359 | 82.4 | 1.000 | lineup-starter | understat|role:attacking_creator | 0.382 | 0.366 | 0.576 | 0.117 |
| Rice | ARS | 5.650 | 87.7 | 1.000 | lineup-starter | understat|role:creator_midfielder | 0.175 | 0.347 | 0.365 | 0.412 |
| Virgil | LIV | 4.616 | 90.0 | 1.000 | lineup-starter | understat|role:set_piece_defender | 0.190 | 0.023 | 0.316 | 0.433 |
| A.Becker | LIV | 3.723 | 90.0 | 1.000 | lineup-starter | archive-expected|role:goalkeeper | 0.000 | 0.002 | 0.557 | 0.000 |
| Matheus N. | MCI | 4.323 | 87.3 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.041 | 0.162 | 0.240 | 0.147 |
| Gabriel | ARS | 7.661 | 89.5 | 1.000 | lineup-starter | understat|role:attacking_defender | 0.181 | 0.193 | 0.738 | 0.481 |

## Key comparisons

- **Haaland vs Watkins:** gap +1.828 xPTS; xG+xA 0.908 vs 0.532; minutes 86.3 vs 82.0
- **Palmer vs Neto:** gap +0.236 xPTS; xG+xA 0.304 vs 0.302; minutes 78.8 vs 81.6
- **Palmer vs Caicedo:** gap +0.566 xPTS; xG+xA 0.304 vs 0.121; minutes 78.8 vs 86.0
- **Saka vs Rice:** gap +0.709 xPTS; xG+xA 0.748 vs 0.522; minutes 82.4 vs 87.7

## Current failure counts

- High xPTS with under 35 minutes: **0**
- Under 2.2 xPTS with 70+ minutes: **5**

This report is generated after every projection change. A change is not accepted only because selected players look better; structural gates and whole-table comparisons must also improve.

