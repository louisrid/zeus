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
