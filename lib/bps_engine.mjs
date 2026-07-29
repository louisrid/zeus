// A-10 · BPS engine: computes match BPS per player from event stats, driven by the ruleset JSON.
// Approximation over stats the archive carries; the backtest (A-11) quantifies the gap vs actual BPS.
export function bpsFor(stat, position, rules) {
  const v = (k) => rules.bps[k].value;
  let bps = 0;
  const min = stat.minutes || 0;
  if (min > 0) bps += min >= 60 ? v("minutes_60_plus") : v("minutes_1_to_60");
  const goals = stat.goals || 0;
  if (goals) {
    const per = position === "FWD" ? v("goal_fwd") : position === "MID" ? v("goal_mid") : position === "DEF" ? v("goal_def") : v("goal_gkp");
    bps += goals * per;
  }
  bps += (stat.assists || 0) * v("assist");
  if ((position === "GKP" || position === "DEF") && min >= 60 && (stat.goals_conceded || 0) === 0) bps += v("clean_sheet_gkp_def");
  bps += (stat.saves || 0) * v("save_any");
  bps += (stat.pens_saved || 0) * v("penalty_save");
  bps += (stat.pens_missed || 0) * v("penalty_miss");
  if (position === "GKP" || position === "DEF") bps += Math.floor((stat.goals_conceded || 0)) * 0; // conceded handled at points level; BPS row is low-confidence — excluded from v1, flagged in report
  bps += Math.floor((stat.clearances_blocks_interceptions || 0) / v("cbi_per")) * v("cbi_bps");
  bps += Math.floor((stat.recoveries || 0) / v("recoveries_per")) * v("recoveries_bps");
  bps += (stat.tackles || 0) * v("tackles_won_each");
  bps += (stat.key_passes || 0) * v("key_pass_each");
  bps += (stat.yellow || 0) * v("yellow_card");
  bps += (stat.red || 0) * v("red_card");
  bps += (stat.own_goals || 0) * v("own_goal");
  return bps;
}
// bonus allocation: top three BPS in the match, ties share the higher award
export function allocateBonus(list) {
  const sorted = [...list].sort((a, b) => b.bps - a.bps);
  const out = new Map(list.map((p) => [p.key, 0]));
  if (!sorted.length) return out;
  const scores = [...new Set(sorted.map((p) => p.bps))].slice(0, 3);
  let award = [3, 2, 1], given = 0;
  for (const s of scores) {
    if (given >= 3) break;
    const tied = sorted.filter((p) => p.bps === s);
    const prize = award[given];
    for (const p of tied) out.set(p.key, prize);
    given += tied.length;
  }
  return out;
}

/* THE FORMULA'S OWN BIAS, MEASURED AND HANDED BACK.
 *
 * bpsFor covers goals, assists, saves, clean sheets and defensive counts, but the real BPS system also pays
 * pass completion, chances created, dribbles and shots, none of which the archive carries per gameweek. That
 * missing credit lands very unevenly: fed a season of REAL stats, the formula scored goalkeepers 2.8 BPS a
 * match too HIGH and midfielders 2.4 too LOW (2025-26, starters). Bonus is a race, so a position scored
 * consistently high wins simulated bonus it does not win in reality: keepers were projected 0.57 bonus a
 * match against an actual 0.23.
 *
 * The correction is DERIVED, never typed in: run bpsFor over archive rows the model is allowed to see, take
 * actual BPS minus modelled BPS per position, and add that mean back in the race. Walk-forward callers pass
 * only rows from before the gameweek being simulated. */
export function deriveBpsOffsets(rows, rules) {
  const g = {};
  for (const r of rows) {
    const min = Number(r.minutes) || 0;
    if (min < 60) continue;
    const pos = r.position;
    if (!["GKP", "DEF", "MID", "FWD"].includes(pos)) continue;
    const model = bpsFor({
      minutes: min, goals: Number(r.goals) || 0, assists: Number(r.assists) || 0,
      goals_conceded: Number(r.goals_conceded) || 0, saves: Number(r.saves) || 0,
      pens_saved: Number(r.pens_saved) || 0, pens_missed: Number(r.pens_missed) || 0,
      clearances_blocks_interceptions: Number(r.cbit) || 0,
      recoveries: Number(r.recoveries) || 0, tackles: Number(r.tackles) || 0,
      key_passes: 0, yellow: Number(r.yellow) || 0, red: Number(r.red) || 0,
      own_goals: Number(r.own_goals) || 0,
    }, pos, rules);
    g[pos] ??= { n: 0, sum: 0 };
    g[pos].n++;
    g[pos].sum += (Number(r.bps) || 0) - model;
  }
  const out = {};
  // Below 30 starts the mean is noise, not a measurement: no offset is applied.
  for (const [p, v] of Object.entries(g)) out[p] = v.n >= 30 ? v.sum / v.n : 0;
  return out;
}
