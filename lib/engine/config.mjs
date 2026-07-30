// Loads config/engine-2026-27.json and flattens {value,status} nodes into plain runtime values.
// Nothing else in the engine reads the file directly, so there is exactly one place where a
// parameter can enter the system.

const v = (node, fallback = null) =>
  node && typeof node === "object" && "value" in node ? node.value : fallback;

export function engineConfig(json) {
  const dc = json.dixon_coles;
  const al = json.allocation;
  const mi = json.minutes;
  const si = json.simulation;
  return {
    engineVersion: json.metadata.engine_version,
    rho: v(dc.rho),
    gridCap: v(dc.grid_cap),

    kPos: v(al.k_pos),
    // Allocation used a hidden fallback of 12 even though k_pos=20 was the measured value.
    // Keep one parameter name throughout the engine so live projections use the fitted setting.
    rateShrinkNineties: v(al.k_pos),
    roleRates: null,
    newcomerStartRate: v(mi.newcomer_start_rate, 0.18),
    leagueRates: json.league_rates ? { npxg90: json.league_rates.npxg90, xa90: json.league_rates.xa90, cbit90: json.league_rates.cbit90, recoveries90: json.league_rates.recoveries90 } : null,
    finishingK: v(al.finishing_k),
    finishingClamp: v(al.finishing_clamp),
    penAttemptK: v(al.pen_attempt_k),
    penRateShrinkMatches: v(al.pen_rate_shrink_matches, 38),
    penLambdaExponent: v(al.pen_lambda_exponent, 0.5),
    penLambdaMinScale: v(al.pen_lambda_min_scale, 0.65),
    penLambdaMaxScale: v(al.pen_lambda_max_scale, 1.5),
    promotedDecayToGw: v(al.promoted_decay_to_gw),
    promotedPrior: v(al.promoted_prior),

    kStart: v(mi.k_start),
    kSurvive: v(mi.k_survive),
    wMinutesShare: v(mi.w_minutes_share),
    pStartCeiling: v(mi.p_start_ceiling),
    earlySubShare: v(mi.early_sub_share),
    wcPrior: v(mi.wc_prior),

    N: v(si.n_sims),
    seed: v(si.seed),
    fullTime: v(si.full_time),
    subOffMinute: v(si.sub_off_minute),
    countDispersion: v(si.count_dispersion),
    stateCbitBoost: v(si.state_cbit_boost),
    tackleShareOfCbit: v(si.tackle_share_of_cbit),
    shotsOnTargetPerGoal: v(si.shots_on_target_per_goal),
    unassistedShare: v(si.unassisted_share),
  };
}

/* Every INTERIM parameter with its upgrade date, so a run can record exactly what was provisional. */
export function interimParameters(json) {
  const out = [];
  const walk = (obj, path) => {
    for (const [k, node] of Object.entries(obj)) {
      if (k === "metadata") continue;
      if (node && typeof node === "object") {
        if ("status" in node) {
          if (node.status === "INTERIM") out.push({ key: [...path, k].join("."), upgrade_date: node.upgrade_date || null });
        } else {
          walk(node, [...path, k]);
        }
      }
    }
  };
  walk(json, []);
  return out;
}
