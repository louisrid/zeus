const finite = (value) => Number.isFinite(Number(value));
const number = (value) => finite(value) ? Math.max(0, Number(value)) : 0;

function quantile(values, q) {
  const a = values.filter(finite).map(Number).sort((x, y) => x - y);
  if (!a.length) return 0;
  const at = (a.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (at - lo);
}

function metrics(profile) {
  const nineties = number(profile.nineties ?? profile.rateNineties);
  const npxg90 = finite(profile.npxg90) ? number(profile.npxg90)
    : (nineties > 0 ? number(profile.xg ?? profile.npxg) / nineties : 0);
  const xa90 = finite(profile.xa90) ? number(profile.xa90)
    : (nineties > 0 ? number(profile.xa) / nineties : 0);
  const cbit90 = finite(profile.cbit90) ? number(profile.cbit90)
    : (nineties > 0 ? number(profile.cbit) / nineties : 0);
  const recoveries90 = finite(profile.recoveries90) ? number(profile.recoveries90)
    : (nineties > 0 ? number(profile.recoveries) / nineties : 0);
  return { nineties, npxg90, xa90, cbit90, recoveries90, threat: npxg90 + xa90, defence: cbit90 + recoveries90 };
}

export function deriveRoleThresholds(profiles = [], minimumNineties = 6) {
  const out = {};
  for (const position of ["GKP", "DEF", "MID", "FWD"]) {
    const rows = profiles
      .filter((p) => p.position === position)
      .map(metrics)
      .filter((m) => m.nineties >= minimumNineties);
    out[position] = {
      npxg33: quantile(rows.map((r) => r.npxg90), 1 / 3),
      npxg50: quantile(rows.map((r) => r.npxg90), 0.5),
      npxg67: quantile(rows.map((r) => r.npxg90), 2 / 3),
      xa33: quantile(rows.map((r) => r.xa90), 1 / 3),
      xa50: quantile(rows.map((r) => r.xa90), 0.5),
      xa67: quantile(rows.map((r) => r.xa90), 2 / 3),
      threat33: quantile(rows.map((r) => r.threat), 1 / 3),
      threat50: quantile(rows.map((r) => r.threat), 0.5),
      defence67: quantile(rows.map((r) => r.defence), 2 / 3),
      count: rows.length,
    };
  }
  return out;
}

export function classifyPlayerRole(profile, thresholds, minimumNineties = 3) {
  const position = profile.position;
  if (position === "GKP") return "goalkeeper";
  const m = metrics(profile);
  const t = thresholds?.[position];
  if (!t || t.count < 4 || m.nineties < minimumNineties) return null;

  if (position === "DEF") {
    if (m.xa90 >= t.xa67) return "attacking_defender";
    if (m.npxg90 >= t.npxg67) return "set_piece_defender";
    if (m.defence >= t.defence67) return "stopper_defender";
    return "balanced_defender";
  }

  if (position === "MID") {
    if (m.xa90 >= t.xa67 && m.npxg90 >= t.npxg50) return "attacking_creator";
    if (m.xa90 >= t.xa67) return "creator_midfielder";
    if (m.npxg90 >= t.npxg67) return "attacking_midfielder";
    if (m.threat <= t.threat33 && m.defence >= t.defence67) return "holding_midfielder";
    return "box_to_box_midfielder";
  }

  if (position === "FWD") {
    if (m.npxg90 >= t.npxg67 && m.xa90 >= t.xa50) return "complete_forward";
    if (m.npxg90 >= t.npxg67) return "focal_striker";
    if (m.xa90 >= t.xa67) return "creative_forward";
    return "supporting_forward";
  }
  return null;
}

export function deriveRoleRates(profiles = [], thresholds = deriveRoleThresholds(profiles), minimumRoleNineties = 30) {
  const grouped = new Map();
  for (const profile of profiles) {
    const role = classifyPlayerRole(profile, thresholds);
    if (!role) continue;
    const m = metrics(profile);
    if (m.nineties <= 0) continue;
    const g = grouped.get(role) || { nineties: 0, npxg: 0, xa: 0, cbit: 0, recoveries: 0, players: 0 };
    g.nineties += m.nineties;
    g.npxg += m.npxg90 * m.nineties;
    g.xa += m.xa90 * m.nineties;
    g.cbit += m.cbit90 * m.nineties;
    g.recoveries += m.recoveries90 * m.nineties;
    g.players += 1;
    grouped.set(role, g);
  }
  const npxg90 = {};
  const xa90 = {};
  const cbit90 = {};
  const recoveries90 = {};
  for (const [role, g] of grouped) {
    if (g.nineties < minimumRoleNineties || g.players < 3) continue;
    npxg90[role] = g.npxg / g.nineties;
    xa90[role] = g.xa / g.nineties;
    cbit90[role] = g.cbit / g.nineties;
    recoveries90[role] = g.recoveries / g.nineties;
  }
  return { npxg90, xa90, cbit90, recoveries90 };
}

export function derivePositionDefensiveRates(profiles = [], minimumPlayerNineties = 6) {
  const grouped = new Map();
  for (const profile of profiles) {
    const m = metrics(profile);
    const position = String(profile?.position || "").toUpperCase();
    if (!["DEF", "MID", "FWD"].includes(position) || m.nineties < minimumPlayerNineties) continue;
    const g = grouped.get(position) || { nineties: 0, cbit: 0, recoveries: 0, players: 0 };
    g.nineties += m.nineties;
    g.cbit += m.cbit90 * m.nineties;
    g.recoveries += m.recoveries90 * m.nineties;
    g.players += 1;
    grouped.set(position, g);
  }
  const cbit90 = {};
  const recoveries90 = {};
  for (const [position, g] of grouped) {
    if (g.players < 3 || g.nineties <= 0) continue;
    cbit90[position] = g.cbit / g.nineties;
    recoveries90[position] = g.recoveries / g.nineties;
  }
  return { cbit90, recoveries90 };
}


/* Robust upper bounds for low-sample attacking rates, derived from established players rather than
   declared as player or club exceptions. A short hot spell may inform a projection, but it cannot sit
   above the established population's upper tail and then absorb a strong club's lambda. Established
   players are never capped by this mechanism. */
export function deriveAttackingRateBounds(
  profiles = [],
  thresholds = deriveRoleThresholds(profiles),
  { minimumNineties = 10, upperQuantile = 0.9 } = {},
) {
  const out = {
    npxg90: { position: {}, role: {} },
    xa90: { position: {}, role: {} },
  };
  const established = profiles
    .map((profile) => ({ profile, metrics: metrics(profile) }))
    .filter(({ metrics: m }) => m.nineties >= minimumNineties);

  for (const field of ["npxg90", "xa90"]) {
    for (const position of ["GKP", "DEF", "MID", "FWD"]) {
      const values = established
        .filter(({ profile }) => profile.position === position)
        .map(({ metrics: m }) => m[field]);
      if (values.length >= 4) out[field].position[position] = quantile(values, upperQuantile);
    }

    const byRole = new Map();
    for (const { profile, metrics: m } of established) {
      const role = classifyPlayerRole(profile, thresholds, minimumNineties);
      if (!role) continue;
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(m[field]);
    }
    for (const [role, values] of byRole) {
      if (values.length >= 4) out[field].role[role] = quantile(values, upperQuantile);
    }
  }
  return out;
}

export function buildRoleModel(historyProfiles = [], {
  minimumPlayerNineties = 10,
  defensiveShrinkNineties = 10,
} = {}) {
  const thresholds = deriveRoleThresholds(historyProfiles);
  return {
    thresholds,
    rates: deriveRoleRates(historyProfiles, thresholds),
    attackingRateBounds: deriveAttackingRateBounds(historyProfiles, thresholds, {
      minimumNineties: minimumPlayerNineties,
    }),
    positionDefensiveRates: derivePositionDefensiveRates(historyProfiles),
    minimumPlayerNineties,
    defensiveShrinkNineties,
  };
}

export function attachPlayerRole(profile, model) {
  /* Do not let a short hot streak choose its own aggressive prior. The same eight-ninety sample was being
     used first to label a player a complete forward and then again as evidence toward the complete-forward
     prior, which reinforced low-sample spikes such as Osula. Until the sample clears the configured floor,
     the position prior is the honest hierarchy level. */
  const role = classifyPlayerRole(profile, model?.thresholds, model?.minimumPlayerNineties ?? 10);
  return {
    ...profile,
    role,
    role_source: role ? "derived-prior-season" : "position-only",
  };
}


/* A valid predicted formation may provide the missing hierarchy for a player with little or no Premier
   League evidence. It changes only the shrinkage target used to divide the team's fixed attacking total.
   A role learned from real matches always wins, and a player with an established sample remains on the
   position hierarchy rather than being re-labelled by one predicted XI. */
export function applyLineupRolePrior(profile, fallbackRole = null, minimumNineties = 10) {
  if (!fallbackRole || profile?.role) return { ...profile, lineup_role: fallbackRole || null };
  const nineties = metrics(profile).nineties;
  if (nineties >= Math.max(0, Number(minimumNineties) || 0)) {
    return { ...profile, lineup_role: fallbackRole };
  }

  const position = String(profile?.position || "").toUpperCase();
  const allowed = {
    GKP: new Set(["goalkeeper"]),
    DEF: new Set(["attacking_defender", "set_piece_defender", "stopper_defender", "balanced_defender"]),
    MID: new Set(["attacking_creator", "creator_midfielder", "attacking_midfielder", "holding_midfielder", "box_to_box_midfielder"]),
    FWD: new Set(["complete_forward", "focal_striker", "creative_forward", "supporting_forward"]),
  };
  if (!allowed[position]?.has(fallbackRole)) return { ...profile, lineup_role: null };
  return {
    ...profile,
    role: fallbackRole,
    role_source: "predicted-formation-fallback",
    lineup_role: fallbackRole,
  };
}

/* Predicted-lineup rows run from goalkeeper to attack. They are useful fallback evidence for a player
   with no prior-season role, but not strong enough to replace a role learned from real match data. */
export function lineupTacticalRolesOf(resolution) {
  const roles = new Map();
  for (const value of resolution?.byClub?.values?.() || []) {
    if (!value?.valid) continue;
    const lines = value.lines || [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex] || [];
      const isLastLine = lineIndex === lines.length - 1;
      for (const entry of line) {
        const player = entry?.player;
        if (!player) continue;
        const position = String(player.position || "").toUpperCase();
        let role = null;
        if (position === "GKP") role = "goalkeeper";
        else if (position === "DEF") role = lineIndex === 1 ? "balanced_defender" : "attacking_defender";
        else if (position === "FWD") role = isLastLine ? "focal_striker" : "supporting_forward";
        else if (position === "MID") {
          if (lineIndex === 2 && line.length <= 2) role = "holding_midfielder";
          else if (lineIndex === 2) role = "box_to_box_midfielder";
          else if (isLastLine) role = "attacking_midfielder";
          else role = "attacking_midfielder";
        }
        if (role) roles.set(player.fpl_id, role);
      }
    }
  }
  return roles;
}

const defensivePriorFor = (profile, model, field, fallbackRole = null) => {
  const role = profile.role || fallbackRole;
  const roleValue = Number(model?.rates?.[field]?.[role]);
  if (Number.isFinite(roleValue) && roleValue > 0) return { value: roleValue, source: `role:${role}` };
  const position = String(profile.position || "").toUpperCase();
  const positionValue = Number(model?.positionDefensiveRates?.[field]?.[position]);
  if (Number.isFinite(positionValue) && positionValue > 0) return { value: positionValue, source: `position:${position}` };
  return null;
};

/* A named holding midfielder with no Premier League history must not enter the simulation with zero
   clearances/interceptions/tackles and zero recoveries. Fill only the missing defensive evidence, using
   role or position rates derived from the archive. Attacking rates, minutes and start probabilities are
   deliberately untouched. */
export function applyDefensiveRolePrior(profile, model, fallbackRole = null) {
  const position = String(profile?.position || "").toUpperCase();
  const effectiveRole = profile?.role || fallbackRole;
  if (position !== "MID" || !["holding_midfielder", "box_to_box_midfielder"].includes(effectiveRole)) {
    return { ...profile, lineup_role: fallbackRole || null };
  }

  const m = metrics(profile);
  const minimum = Math.max(0, Number(model?.minimumPlayerNineties ?? 10));
  if (m.nineties >= minimum) {
    return { ...profile, lineup_role: fallbackRole || null, defensive_role: effectiveRole };
  }

  const k = Math.max(0, Number(model?.defensiveShrinkNineties ?? minimum));
  const blend = k > 0 ? k / (m.nineties + k) : 0;
  const cbitPrior = defensivePriorFor(profile, model, "cbit90", fallbackRole);
  const recoveryPrior = defensivePriorFor(profile, model, "recoveries90", fallbackRole);
  const blendRate = (observed, prior) => prior
    ? Math.max(0, m.nineties * Math.max(0, Number(observed) || 0) + k * prior.value) / Math.max(1e-9, m.nineties + k)
    : Math.max(0, Number(observed) || 0);

  return {
    ...profile,
    lineup_role: fallbackRole || null,
    defensive_role: effectiveRole,
    cbit90: blendRate(profile.cbit90, cbitPrior),
    recoveries90: blendRate(profile.recoveries90, recoveryPrior),
    defensive_prior_blend: blend,
    defensive_rate_source: [cbitPrior?.source, recoveryPrior?.source].filter(Boolean).join("+") || "unavailable",
  };
}
