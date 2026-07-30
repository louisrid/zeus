# ZEUS xPTS Automated Audit

Source: `Supabase Snippet Untitled query (7)(1).csv`
Rows: 564

## Structural gates

- **PASS:** Team starts sum to 11
- **PASS:** Goalkeeper starts sum to 1
- **FAIL:** Team expected minutes sum to 990 ±5
- **PASS:** Unavailable players are zero
- **FAIL:** GW1 named starters have 100% start chance
- **FAIL:** GW1 non-starters have 0% start chance

## Data coverage

- Positional-prior players: **276 / 564 (48.9%)**
- Established players with 20+ historical nineties still on priors: **31**

## Watch players

| Player | Team | xPTS | xMins | P(start) | Route | Rate source | xG | xA | Bonus | DEFCON |
|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|
| Haaland | MCI | 6.189 | 79.0 | 0.886 | lineup-starter | understat | 0.715 | 0.157 | 1.183 | 0.010 |
| Watkins | AVL | 4.452 | 84.6 | 0.958 | lineup-starter | understat | 0.419 | 0.062 | 0.789 | 0.006 |
| Palmer | CHE | 3.043 | 73.2 | 0.837 | lineup-starter | understat | 0.161 | 0.095 | 0.187 | 0.050 |
| Neto | CHE | 2.955 | 77.7 | 0.880 | lineup-starter | prior-positional | 0.120 | 0.126 | 0.134 | 0.015 |
| Caicedo | CHE | 3.597 | 79.5 | 0.892 | lineup-starter | prior-positional | 0.130 | 0.133 | 0.215 | 0.374 |
| Saka | ARS | 5.679 | 77.2 | 0.873 | lineup-starter | understat | 0.318 | 0.372 | 0.525 | 0.128 |
| Rice | ARS | 5.636 | 83.5 | 0.933 | lineup-starter | understat | 0.195 | 0.362 | 0.430 | 0.429 |
| Virgil | LIV | 1.798 | 32.2 | 0.330 | lineup-notNamed | understat | 0.056 | 0.009 | 0.087 | 0.115 |
| A.Becker | LIV | 1.343 | 28.0 | 0.340 | lineup-notNamed | prior-positional | 0.000 | 0.000 | 0.191 | 0.000 |
| Matheus N. | MCI | 1.458 | 27.7 | 0.261 | lineup-notNamed | understat | 0.014 | 0.048 | 0.062 | 0.031 |
| Gabriel | ARS | 6.669 | 81.9 | 0.910 | lineup-starter | understat | 0.166 | 0.145 | 0.667 | 0.409 |

## Key comparisons

- **Haaland vs Watkins:** gap +1.737 xPTS; xG+xA 0.872 vs 0.481; minutes 79.0 vs 84.6
- **Palmer vs Neto:** gap +0.088 xPTS; xG+xA 0.256 vs 0.246; minutes 73.2 vs 77.7
- **Palmer vs Caicedo:** gap -0.554 xPTS; xG+xA 0.256 vs 0.263; minutes 73.2 vs 79.5
- **Saka vs Rice:** gap +0.043 xPTS; xG+xA 0.690 vs 0.557; minutes 77.2 vs 83.5

## Current failure counts

- High xPTS with under 35 minutes: **0**
- Under 2.2 xPTS with 70+ minutes: **16**

This report is generated after every projection change. A change is not accepted only because selected players look better; structural gates and whole-table comparisons must also improve.
