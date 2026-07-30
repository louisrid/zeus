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
    const g = grouped.get(role) || { nineties: 0, npxg: 0, xa: 0, players: 0 };
    g.nineties += m.nineties;
    g.npxg += m.npxg90 * m.nineties;
    g.xa += m.xa90 * m.nineties;
    g.players += 1;
    grouped.set(role, g);
  }
  const npxg90 = {};
  const xa90 = {};
  for (const [role, g] of grouped) {
    if (g.nineties < minimumRoleNineties || g.players < 3) continue;
    npxg90[role] = g.npxg / g.nineties;
    xa90[role] = g.xa / g.nineties;
  }
  return { npxg90, xa90 };
}

export function buildRoleModel(historyProfiles = []) {
  const thresholds = deriveRoleThresholds(historyProfiles);
  return { thresholds, rates: deriveRoleRates(historyProfiles, thresholds) };
}

export function attachPlayerRole(profile, model) {
  const role = classifyPlayerRole(profile, model?.thresholds);
  return {
    ...profile,
    role,
    role_source: role ? "derived-prior-season" : "position-only",
  };
}
