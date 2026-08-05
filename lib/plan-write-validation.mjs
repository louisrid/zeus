import { PLAN_RULES, squadAt, validateChips } from "./plan.mjs";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const asId = (value) => {
  const raw = value?.fpl_id ?? value?.element ?? value?.id ?? value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const ids = (values) => (Array.isArray(values) ? values : []).map(asId);
const uniqueValidIds = (values) => [...new Set(ids(values).filter((id) => id !== null))];

function formationFor(players, starterIds) {
  const starterSet = new Set(starterIds);
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of players || []) {
    if (starterSet.has(asId(player)) && counts[player?.position] !== undefined) counts[player.position] += 1;
  }
  if (counts.GKP !== 1) return null;
  if (counts.DEF < 3 || counts.DEF > 5) return null;
  if (counts.MID < 2 || counts.MID > 5) return null;
  if (counts.FWD < 1 || counts.FWD > 3) return null;
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

function validateSquadShape(players, label, errors, requireComplete) {
  const rows = Array.isArray(players) ? players : [];
  const rowIds = ids(rows);
  const unique = uniqueValidIds(rows);
  if (rows.length > PLAN_RULES.squadSize) errors.push(`${label} contains ${rows.length} players, maximum is ${PLAN_RULES.squadSize}`);
  if (rowIds.some((id) => id === null) || unique.length !== rows.length) errors.push(`${label} player IDs must be unique positive integers`);
  for (const [position, maximum] of Object.entries(PLAN_RULES.quotas)) {
    const count = rows.filter((player) => player?.position === position).length;
    if (count > maximum) errors.push(`${label} ${position} count is ${count}, maximum is ${maximum}`);
    if (requireComplete && count !== maximum) errors.push(`${label} ${position} count is ${count}, expected ${maximum}`);
  }
  const clubs = new Map();
  for (const player of rows) {
    const teamId = Number(player?.team_id);
    if (Number.isInteger(teamId) && teamId > 0) clubs.set(teamId, (clubs.get(teamId) || 0) + 1);
  }
  for (const [teamId, count] of clubs) if (count > PLAN_RULES.maxPerClub) errors.push(`${label} club ${teamId} has ${count} players, maximum is ${PLAN_RULES.maxPerClub}`);
}

function validateTransfer(transfer, gw, index, errors) {
  const out = asId(transfer?.out);
  const incoming = asId(transfer?.in);
  if (out === null || incoming === null) errors.push(`GW${gw} transfer ${index + 1} requires numeric out and in IDs`);
  if (out !== null && out === incoming) errors.push(`GW${gw} transfer ${index + 1} cannot replace a player with himself`);
  if (transfer?.position && !Object.hasOwn(PLAN_RULES.quotas, transfer.position)) errors.push(`GW${gw} transfer ${index + 1} has unsupported position ${transfer.position}`);
}

export function validatePlanWrite({
  base,
  weeks,
  structure = "3-5-2",
  captain = null,
  vice = null,
  strictGameweeks = [],
} = {}) {
  const errors = [];
  const squad = Array.isArray(base) ? base : [];
  const weekMap = weeks && typeof weeks === "object" && !Array.isArray(weeks) ? weeks : {};
  validateSquadShape(squad, "base", errors, squad.length === PLAN_RULES.squadSize);

  const validWeekKeys = [];
  for (const key of Object.keys(weekMap)) {
    const gw = Number(key);
    if (!Number.isInteger(gw) || gw < 1 || gw > 38 || String(gw) !== String(key)) {
      errors.push(`invalid gameweek key ${key}; use canonical keys "1" to "38" and never "0"`);
    } else {
      validWeekKeys.push(gw);
    }
  }

  const strict = new Set((Array.isArray(strictGameweeks) ? strictGameweeks : [])
    .map(Number).filter((gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38));
  for (const gw of strict) if (!own(weekMap, String(gw))) errors.push(`GW${gw} is required but missing from weeks`);

  const plan = { base: squad, weeks: weekMap, structure, captain, vice };
  for (const gw of validWeekKeys.sort((a, b) => a - b)) {
    const week = weekMap[String(gw)] || weekMap[gw] || {};
    const transfers = Array.isArray(week.transfers) ? week.transfers : [];
    transfers.forEach((transfer, index) => validateTransfer(transfer, gw, index, errors));

    const state = squadAt(plan, gw);
    for (const problem of state.problems || []) {
      errors.push(problem.kind === "missing_out"
        ? `GW${problem.gw} transfers out a player who is not in the squad`
        : `GW${problem.gw} transfers in a player who is already in the squad`);
    }
    if ((state.players || []).length === PLAN_RULES.squadSize) validateSquadShape(state.players, `GW${gw} squad`, errors, true);
    else if ((state.players || []).length > PLAN_RULES.squadSize) validateSquadShape(state.players, `GW${gw} squad`, errors, false);

    const hasStarting = Array.isArray(week.startingIds);
    const hasBench = Array.isArray(week.benchOrder);
    const fullRolesRequired = strict.has(gw) || hasStarting || hasBench;
    if (!fullRolesRequired) continue;
    if (!hasStarting) errors.push(`GW${gw} is missing startingIds`);
    if (!hasBench) errors.push(`GW${gw} is missing benchOrder`);
    if (!hasStarting || !hasBench) continue;

    const currentIds = uniqueValidIds(state.players || []);
    const currentSet = new Set(currentIds);
    const starterRaw = ids(week.startingIds);
    const benchRaw = ids(week.benchOrder);
    const starters = uniqueValidIds(week.startingIds);
    const bench = uniqueValidIds(week.benchOrder);

    if ((state.players || []).length !== PLAN_RULES.squadSize || currentIds.length !== PLAN_RULES.squadSize) errors.push(`GW${gw} must resolve to a complete 15-player squad before weekly roles can be saved`);
    if (starterRaw.some((id) => id === null) || starterRaw.length !== 11 || starters.length !== 11) errors.push(`GW${gw} must contain exactly 11 unique positive startingIds`);
    if (benchRaw.some((id) => id === null) || benchRaw.length !== 4 || bench.length !== 4) errors.push(`GW${gw} must contain exactly four unique positive benchOrder IDs`);

    const outsideStarters = starters.filter((id) => !currentSet.has(id));
    const outsideBench = bench.filter((id) => !currentSet.has(id));
    if (outsideStarters.length) errors.push(`GW${gw} starters outside current squad: ${outsideStarters.join(",")}`);
    if (outsideBench.length) errors.push(`GW${gw} bench outside current squad: ${outsideBench.join(",")}`);
    const benchSet = new Set(bench);
    const overlap = starters.filter((id) => benchSet.has(id));
    if (overlap.length) errors.push(`GW${gw} XI/bench overlap: ${overlap.join(",")}`);
    const union = new Set([...starters, ...bench]);
    if (union.size !== PLAN_RULES.squadSize || currentIds.some((id) => !union.has(id))) errors.push(`GW${gw} startingIds plus benchOrder must equal the current 15-player squad`);

    const expectedFormation = formationFor(state.players || [], starters);
    if (!expectedFormation) errors.push(`GW${gw} startingIds do not form a legal FPL XI`);
    if (expectedFormation && state.structure !== expectedFormation) errors.push(`GW${gw} structure is ${state.structure || "missing"}, expected ${expectedFormation}`);
    const selectedCaptain = asId(state.captain);
    const selectedVice = asId(state.vice);
    if (selectedCaptain === null || !starters.includes(selectedCaptain)) errors.push(`GW${gw} captain must be a starting player`);
    if (selectedVice === null || !starters.includes(selectedVice)) errors.push(`GW${gw} vice must be a starting player`);
    if (selectedCaptain !== null && selectedCaptain === selectedVice) errors.push(`GW${gw} captain and vice must differ`);
  }

  const chipValidation = validateChips(plan);
  for (const error of chipValidation.errors || []) errors.push(error);
  return { ok: errors.length === 0, errors };
}
