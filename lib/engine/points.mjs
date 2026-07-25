// FPL points from a simulated event bundle. Every value is read from the ruleset JSON at
// runtime (01 §3 preamble). No scoring constant appears in this file.

const v = (node) => (node && typeof node === "object" && "value" in node ? node.value : node);

export function scoringTable(rules) {
  const s = rules.scoring;
  const dc = s.defensive_contribution;
  return {
    appearanceUnder60: v(s.appearance_under_60),
    appearance60: v(s.appearance_60_plus),
    goal: { GKP: v(s.goal_gkp), DEF: v(s.goal_def), MID: v(s.goal_mid), FWD: v(s.goal_fwd) },
    assist: v(s.assist),
    cs: { GKP: v(s.clean_sheet_gkp), DEF: v(s.clean_sheet_def), MID: v(s.clean_sheet_mid), FWD: v(s.clean_sheet_fwd) },
    concededPer2: v(s.goals_conceded_per_2_gkp_def),
    savesPer3: v(s.saves_per_3),
    penaltySave: v(s.penalty_save),
    penaltyMiss: v(s.penalty_miss),
    yellow: v(s.yellow_card),
    red: v(s.red_card),
    ownGoal: v(s.own_goal),
    defcon: {
      points: v(dc.points),
      defThreshold: v(dc.def_threshold_cbit),
      midFwdThreshold: v(dc.mid_fwd_threshold_cbirt),
      maxPerMatch: v(dc.max_awards_per_match),
    },
  };
}

/* One player, one match. `ev` carries the simulated event counts. */
export function pointsFor(ev, position, table) {
  if (!ev.minutes || ev.minutes <= 0) return 0;
  let pts = ev.minutes >= 60 ? table.appearance60 : table.appearanceUnder60;

  pts += (ev.goals || 0) * (table.goal[position] ?? 0);
  pts += (ev.assists || 0) * table.assist;

  if (ev.minutes >= 60 && (ev.goalsConceded || 0) === 0) pts += table.cs[position] ?? 0;
  if (position === "GKP" || position === "DEF") {
    pts += Math.floor((ev.goalsConceded || 0) / 2) * table.concededPer2;
  }
  if (position === "GKP") pts += Math.floor((ev.saves || 0) / 3) * table.savesPer3;

  pts += (ev.pensSaved || 0) * table.penaltySave;
  pts += (ev.pensMissed || 0) * table.penaltyMiss;
  pts += (ev.yellow || 0) * table.yellow;
  pts += (ev.red || 0) * table.red;
  pts += (ev.ownGoals || 0) * table.ownGoal;

  const threshold = position === "DEF" ? table.defcon.defThreshold : table.defcon.midFwdThreshold;
  const contribution = position === "DEF"
    ? (ev.cbit || 0)
    : (ev.cbit || 0) + (ev.recoveries || 0);
  if (position !== "GKP" && contribution >= threshold) {
    pts += table.defcon.points * table.defcon.maxPerMatch;
  }

  pts += ev.bonus || 0;
  return pts;
}

/* Bonus ranks and the tie rule come from the ruleset too. */
export function bonusRanks(rules) {
  return v(rules.bps.bonus_awarding.ranks) || [3, 2, 1];
}

export function squadRules(rules) {
  const sq = rules.squad;
  return {
    size: v(sq.size),
    composition: v(sq.composition),
    budget: v(sq.budget_millions),
    maxPerClub: v(sq.max_per_club),
    startingXI: v(sq.starting_xi),
    formation: v(sq.formation_minimums),
  };
}

export function transferRules(rules) {
  const t = rules.transfers;
  return {
    freePerGw: v(t.free_per_gw),
    maxBanked: v(t.max_banked),
    hitCost: v(t.hit_cost),
  };
}
