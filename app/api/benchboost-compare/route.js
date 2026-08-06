import { createClient } from "@supabase/supabase-js";
import { loadForServer } from "../../../lib/server/load.mjs";
import { buildExactSquadForRange } from "../../../lib/server/exact-range-optimiser.mjs";
import {
  compareBenchBoostBuilds,
  nextAvailablePlanName,
  planRowFromBenchBoostBuild,
  renderBenchBoostReport,
  verifySavedPlan,
} from "../../../lib/benchboost-comparison.mjs";
import { findAlwaysBenchedReplacementOptions } from "../../../lib/benchboost-replacements.mjs";
import { validatePlanWrite } from "../../../lib/plan-write-validation.mjs";
import { parseMinimumBenchSpend } from "../../../lib/minimum-bench-spend.mjs";
import { parseExcludedPlayerIds } from "../../../lib/excluded-player-ids.mjs";
import { reconcilePlayerIdsAndNames } from "../../../lib/server/player-name-resolution.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const BENCH_ORDER_POLICY = "backup_gkp_first_then_outfield_descending_xpts";
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (value) => Number(value?.fpl_id ?? value?.element ?? value?.id ?? value);
const sumCost = (players) => players.reduce((sum, player) => sum + finite(player?.price), 0);
const rounded = (value) => Math.round(finite(value) * 10) / 10;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function optionalFinite(body, keys, fallback = null) {
  for (const key of keys) {
    const value = body?.[key];
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return fallback;
}

function parseBody(body) {
  const gwFrom = Number(body?.gw_from ?? 1);
  const gwTo = Number(body?.gw_to ?? 3);
  const budget = Number(body?.budget ?? 100);
  if (!Number.isInteger(gwFrom) || !Number.isInteger(gwTo) || gwFrom < 1 || gwTo > 8 || gwTo < gwFrom) {
    return { ok: false, error: "gw_from and gw_to must define an inclusive range within GW1-GW8." };
  }
  if (!Number.isFinite(budget) || budget <= 0) return { ok: false, error: "budget must be a positive number." };

  const minimumResult = parseMinimumBenchSpend(body, { budget, required: true });
  if (!minimumResult.ok) return minimumResult;
  const minimumBenchSpend = minimumResult.value;

  let minimumMoneyInBank = optionalFinite(body,
    ["minimum_money_in_bank", "money_in_bank", "leave_in_bank", "bank"], 0);
  let maximumMoneyInBank = optionalFinite(body, ["maximum_money_in_bank"], null);
  const exactMoneyInBank = optionalFinite(body, ["exact_money_in_bank"], null);
  if (exactMoneyInBank !== null) {
    if (!Number.isFinite(exactMoneyInBank) || exactMoneyInBank < 0 || exactMoneyInBank >= budget) {
      return { ok: false, error: "exact_money_in_bank must be at least 0 and lower than the total budget." };
    }
    const explicitMinimum = body?.minimum_money_in_bank ?? body?.money_in_bank ?? body?.leave_in_bank ?? body?.bank;
    if (explicitMinimum !== undefined && Number(explicitMinimum) !== exactMoneyInBank) {
      return { ok: false, error: "exact_money_in_bank conflicts with the supplied minimum money-in-bank value." };
    }
    if (maximumMoneyInBank !== null && maximumMoneyInBank !== exactMoneyInBank) {
      return { ok: false, error: "exact_money_in_bank conflicts with maximum_money_in_bank." };
    }
    minimumMoneyInBank = exactMoneyInBank;
    maximumMoneyInBank = exactMoneyInBank;
  }
  if (!Number.isFinite(minimumMoneyInBank) || minimumMoneyInBank < 0 || minimumMoneyInBank >= budget) {
    return { ok: false, error: "minimum_money_in_bank must be at least 0 and lower than the total budget." };
  }
  if (maximumMoneyInBank !== null
    && (!Number.isFinite(maximumMoneyInBank) || maximumMoneyInBank < minimumMoneyInBank || maximumMoneyInBank >= budget)) {
    return { ok: false, error: "maximum_money_in_bank must be at least the minimum and lower than the total budget." };
  }
  const maximumSquadSpend = budget - minimumMoneyInBank;
  const minimumSquadSpend = maximumMoneyInBank === null ? null : budget - maximumMoneyInBank;
  if (minimumBenchSpend > maximumSquadSpend) {
    return { ok: false, error: "minimum_bench_spend cannot exceed the budget available after reserving money in the bank." };
  }

  const goalkeeperMaxPrice = optionalFinite(body,
    ["goalkeeper_max_price", "max_goalkeeper_price"], null);
  if (Number.isNaN(goalkeeperMaxPrice) || (goalkeeperMaxPrice !== null && goalkeeperMaxPrice <= 0)) {
    return { ok: false, error: "goalkeeper_max_price must be a positive number when supplied." };
  }
  const minimumGoalkeepersAtOrBelowPrice = goalkeeperMaxPrice === null
    ? 0
    : Number(body?.minimum_goalkeepers_at_or_below_price ?? 1);
  if (goalkeeperMaxPrice !== null
    && (!Number.isInteger(minimumGoalkeepersAtOrBelowPrice)
      || minimumGoalkeepersAtOrBelowPrice < 1
      || minimumGoalkeepersAtOrBelowPrice > 2)) {
    return { ok: false, error: "minimum_goalkeepers_at_or_below_price must be 1 or 2." };
  }

  const requestedBenchOrderPolicy = String(body?.bench_order_policy ?? BENCH_ORDER_POLICY).trim();
  if (requestedBenchOrderPolicy !== BENCH_ORDER_POLICY) {
    return { ok: false, error: `Unsupported bench_order_policy ${requestedBenchOrderPolicy}.` };
  }

  const defaults = Array.from({ length: gwTo - gwFrom + 1 }, (_, index) => gwFrom + index);
  const candidateChipGameweeks = Array.isArray(body?.candidate_chip_gameweeks)
    ? body.candidate_chip_gameweeks.map(Number)
    : defaults;
  if (!candidateChipGameweeks.length
    || candidateChipGameweeks.some((gw) => !Number.isInteger(gw) || gw < gwFrom || gw > gwTo)) {
    return { ok: false, error: "candidate_chip_gameweeks must contain gameweeks inside gw_from-gw_to." };
  }
  if (new Set(candidateChipGameweeks).size !== candidateChipGameweeks.length) {
    return { ok: false, error: "candidate_chip_gameweeks must not contain duplicates." };
  }

  const saveNames = Array.isArray(body?.save_names)
    ? body.save_names.map((name) => String(name || "").trim())
    : [];
  if (saveNames.some((name) => !name)) return { ok: false, error: "save_names cannot contain blank names." };
  if (saveNames.length && saveNames.length !== candidateChipGameweeks.length) {
    return { ok: false, error: "save_names must contain exactly one name for every requested candidate Bench Boost gameweek." };
  }

  const deletePlanIds = [...new Set((Array.isArray(body?.delete_plan_ids) ? body.delete_plan_ids : [])
    .map((id) => String(id || "").trim()).filter(Boolean))];
  const exclusionResult = parseExcludedPlayerIds(body);
  if (!exclusionResult.ok) return exclusionResult;
  const exclusionNamesText = body?.excluded_player_names_text;
  const textExclusions = typeof exclusionNamesText === "string"
    ? exclusionNamesText.split(/[,;\n|]+/).map((name) => name.trim()).filter(Boolean)
    : null;
  const excludePlayerNamesRaw = body?.excluded_player_names
    ?? body?.exclude_player_names
    ?? textExclusions
    ?? [];
  if (!Array.isArray(excludePlayerNamesRaw)) {
    return {
      ok: false,
      error: "excluded_player_names must be an array or excluded_player_names_text must be a delimited string.",
    };
  }

  const suggestAlwaysBenchedReplacements = body?.suggest_always_benched_replacements === true;
  const replacementOptionCount = Number(body?.replacement_option_count ?? 3);
  if (!Number.isInteger(replacementOptionCount) || replacementOptionCount < 1 || replacementOptionCount > 10) {
    return { ok: false, error: "replacement_option_count must be an integer from 1 to 10." };
  }
  const replacementMaxXptsDrop = Number(body?.replacement_max_xpts_drop ?? 1);
  if (!Number.isFinite(replacementMaxXptsDrop) || replacementMaxXptsDrop < 0) {
    return { ok: false, error: "replacement_max_xpts_drop must be a non-negative number." };
  }
  const minimumStartProbability = Number(body?.minimum_start_probability ?? 0.55);
  if (!Number.isFinite(minimumStartProbability) || minimumStartProbability < 0 || minimumStartProbability > 1) {
    return { ok: false, error: "minimum_start_probability must be between 0 and 1." };
  }

  return {
    ok: true,
    gwFrom,
    gwTo,
    budget,
    minimumBenchSpend,
    minimumMoneyInBank,
    maximumMoneyInBank,
    exactMoneyInBank,
    maximumSquadSpend,
    minimumSquadSpend,
    goalkeeperMaxPrice,
    minimumGoalkeepersAtOrBelowPrice,
    benchOrderPolicy: requestedBenchOrderPolicy,
    candidateChipGameweeks,
    saveNames,
    deletePlanIds,
    excludePlayerIds: exclusionResult.value,
    excludePlayerNames: excludePlayerNamesRaw,
    exclusionIdInputField: exclusionResult.source,
    suggestAlwaysBenchedReplacements,
    replacementOptionCount,
    replacementMaxXptsDrop,
    minimumStartProbability,
  };
}

function validateBuild(build, controls, gwFrom, gwTo, excludedPlayerIds = []) {
  const errors = [];
  const players = Array.isArray(build?.players) ? build.players : [];
  const squadIds = players.map(idOf);
  const squadSet = new Set(squadIds);
  const excludedSet = new Set((excludedPlayerIds || []).map(Number));
  const leakedExcludedIds = squadIds.filter((id) => excludedSet.has(id));
  if (leakedExcludedIds.length) {
    errors.push(`excluded players appeared in the squad: ${[...new Set(leakedExcludedIds)].join(",")}`);
  }
  if (players.length !== 15) errors.push(`expected 15 players, received ${players.length}`);
  if (squadSet.size !== 15 || squadIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    errors.push("player IDs are not 15 unique positive integers");
  }

  const quotas = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  for (const [position, expected] of Object.entries(quotas)) {
    const count = players.filter((player) => player.position === position).length;
    if (count !== expected) errors.push(`${position} count is ${count}, expected ${expected}`);
  }
  const clubs = new Map();
  for (const player of players) clubs.set(Number(player.team_id), (clubs.get(Number(player.team_id)) || 0) + 1);
  for (const [teamId, count] of clubs) if (count > 3) errors.push(`club ${teamId} has ${count} players`);

  const squadCost = rounded(sumCost(players));
  if (squadCost > controls.maximumSquadSpend + 1e-9) {
    errors.push(`squad cost ${squadCost.toFixed(1)} exceeds maximum spend ${controls.maximumSquadSpend.toFixed(1)}`);
  }
  const moneyInBank = rounded(controls.budget - squadCost);
  if (moneyInBank + 1e-9 < controls.minimumMoneyInBank) {
    errors.push(`money in bank ${moneyInBank.toFixed(1)} is below required ${controls.minimumMoneyInBank.toFixed(1)}`);
  }
  if (controls.maximumMoneyInBank !== null && moneyInBank > controls.maximumMoneyInBank + 1e-9) {
    errors.push(`money in bank ${moneyInBank.toFixed(1)} exceeds maximum ${controls.maximumMoneyInBank.toFixed(1)}`);
  }
  if (Math.abs(finite(build?.squad_cost) - squadCost) > 0.05) errors.push("reported squad cost does not match players");
  if (Math.abs(finite(build?.money_in_bank) - moneyInBank) > 0.05) errors.push("reported money in bank does not match squad cost");

  if (controls.goalkeeperMaxPrice !== null) {
    const cheapGoalkeepers = players.filter((player) =>
      player.position === "GKP" && finite(player.price) <= controls.goalkeeperMaxPrice + 1e-9);
    if (cheapGoalkeepers.length < controls.minimumGoalkeepersAtOrBelowPrice) {
      errors.push(`only ${cheapGoalkeepers.length} goalkeeper(s) cost ${controls.goalkeeperMaxPrice.toFixed(1)} or less`);
    }
  }

  const expectedWeeks = Array.from({ length: gwTo - gwFrom + 1 }, (_, index) => gwFrom + index);
  const weekly = Array.isArray(build?.weekly) ? build.weekly : [];
  const actualWeeks = weekly.map((week) => Number(week.gw));
  if (JSON.stringify(actualWeeks) !== JSON.stringify(expectedWeeks)) {
    errors.push(`weekly range is ${actualWeeks.join(",") || "missing"}, expected ${expectedWeeks.join(",")}`);
  }

  for (const week of weekly) {
    const gw = Number(week.gw);
    const starters = Array.isArray(week.starters) ? week.starters : [];
    const bench = Array.isArray(week.bench) ? week.bench : [];
    const starterIds = starters.map(idOf);
    const benchIds = bench.map(idOf);
    const starterSet = new Set(starterIds);
    const benchSet = new Set(benchIds);
    const benchOrderIds = (Array.isArray(week.bench_order) ? week.bench_order : []).map((value) => idOf(value));
    const benchOrderSet = new Set(benchOrderIds);
    if (starters.length !== 11 || starterSet.size !== 11) errors.push(`GW${gw} does not have 11 unique starters`);
    if (bench.length !== 4 || benchSet.size !== 4) errors.push(`GW${gw} does not have four unique bench players`);
    if (benchOrderIds.length !== 4 || benchOrderSet.size !== 4
      || benchOrderIds.some((id) => !benchSet.has(id)) || benchIds.some((id) => !benchOrderSet.has(id))) {
      errors.push(`GW${gw} bench_order does not exactly match the four bench players`);
    }
    if (JSON.stringify(benchOrderIds) !== JSON.stringify(benchIds)) {
      errors.push(`GW${gw} bench array is not in the declared bench order`);
    }
    if (bench[0]?.position !== "GKP") errors.push(`GW${gw} backup goalkeeper is not first on the bench`);
    if (bench.slice(1).some((player) => player.position === "GKP")) {
      errors.push(`GW${gw} has a goalkeeper in an outfield bench slot`);
    }
    for (let index = 2; index < bench.length; index += 1) {
      if (finite(bench[index - 1]?.xpts) + 1e-9 < finite(bench[index]?.xpts)) {
        errors.push(`GW${gw} outfield bench is not ordered highest xPTS to lowest`);
        break;
      }
    }
    if (week.bench_order_policy !== controls.benchOrderPolicy) {
      errors.push(`GW${gw} bench order policy is ${week.bench_order_policy}, expected ${controls.benchOrderPolicy}`);
    }

    const overlap = starterIds.filter((id) => benchSet.has(id));
    if (overlap.length) errors.push(`GW${gw} XI/bench overlap: ${overlap.join(",")}`);
    const union = new Set([...starterIds, ...benchIds]);
    if (union.size !== 15 || [...squadSet].some((id) => !union.has(id))) {
      errors.push(`GW${gw} XI and bench do not equal the fixed squad`);
    }
    const outside = [...starterIds, ...benchIds].filter((id) => !squadSet.has(id));
    if (outside.length) errors.push(`GW${gw} contains players outside the fixed squad: ${outside.join(",")}`);

    const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of starters) if (counts[player.position] !== undefined) counts[player.position] += 1;
    const formation = counts.GKP === 1 && counts.DEF >= 3 && counts.DEF <= 5
      && counts.MID >= 2 && counts.MID <= 5 && counts.FWD >= 1 && counts.FWD <= 3
      ? `${counts.DEF}-${counts.MID}-${counts.FWD}` : null;
    if (!formation) errors.push(`GW${gw} has an illegal formation`);
    if (formation && week.formation !== formation) errors.push(`GW${gw} formation is ${week.formation}, expected ${formation}`);

    const captain = Number(week.captain);
    const vice = Number(week.vice_captain);
    if (!starterSet.has(captain)) errors.push(`GW${gw} captain is not a starter`);
    if (!starterSet.has(vice)) errors.push(`GW${gw} vice is not a starter`);
    if (captain === vice) errors.push(`GW${gw} captain and vice are identical`);

    const xiCost = rounded(sumCost(starters));
    const benchCost = rounded(sumCost(bench));
    const derivedXiCeiling = controls.maximumSquadSpend - controls.minimumBenchSpend;
    if (xiCost > derivedXiCeiling + 1e-9) {
      errors.push(`GW${gw} XI costs ${xiCost.toFixed(1)}, above the derived ceiling ${derivedXiCeiling.toFixed(1)}`);
    }
    if (benchCost < controls.minimumBenchSpend - 1e-9) {
      errors.push(`GW${gw} bench costs ${benchCost.toFixed(1)}, below the required minimum ${controls.minimumBenchSpend.toFixed(1)}`);
    }
    if (Math.abs((xiCost + benchCost) - squadCost) > 0.05) {
      errors.push(`GW${gw} XI and bench costs do not equal the fixed squad cost`);
    }
    if (Math.abs(finite(week.xi_cost) - xiCost) > 0.05) errors.push(`GW${gw} stored XI cost does not match its players`);
    if (Math.abs(finite(week.bench_cost) - benchCost) > 0.05) errors.push(`GW${gw} stored bench cost does not match its players`);
  }

  const chipWeeks = weekly.filter((week) => week.chip === "benchboost").map((week) => Number(week.gw));
  if (chipWeeks.length !== 1 || chipWeeks[0] !== Number(build.chip_gw)) {
    errors.push(`Bench Boost schedule is ${chipWeeks.join(",") || "missing"}, expected GW${build.chip_gw}`);
  }

  const solver = build?.solver || {};
  if (solver.engine !== "HiGHS"
    || solver.status !== "OPTIMAL"
    || solver.optimality_proven !== true
    || Number(solver.mip_gap) !== 0
    || Number(solver.requested_mip_rel_gap) !== 0
    || Number(solver.requested_mip_abs_gap) !== 0
    || solver.timeout_used !== false
    || solver.fallback_used !== false) {
    errors.push("complete exact global optimality proof is missing");
  }
  if (!build.objective?.arithmetic_verified) {
    errors.push(`weekly net xPTS sum ${build.objective?.weekly_net_xpts_sum} does not match total ${build.total?.net_xpts}`);
  }
  return { ok: errors.length === 0, errors };
}

function publicBuild(shared, chipGw, controls, gwFrom, gwTo) {
  const players = [...shared.xi, ...shared.bench].map((player) => ({
    fpl_id: idOf(player),
    web_name: player.web_name,
    position: player.position,
    team: player.team,
    team_id: Number(player.team_id),
    price: finite(player.price),
  }));
  const weekly = (shared.weekly || []).map((week) => ({
    ...week,
    xi_cost: rounded(sumCost(week.starters || [])),
    bench_cost: rounded(sumCost(week.bench || [])),
  }));
  const weeklyNetXptsSum = rounded(weekly.reduce((sum, week) => sum + finite(week.net_xpts), 0));
  const reportedTotal = rounded(shared.total?.net_xpts);
  const squadCost = rounded(sumCost(players));
  const moneyInBank = rounded(controls.budget - squadCost);
  const cheapGoalkeepers = controls.goalkeeperMaxPrice === null
    ? []
    : players.filter((player) =>
      player.position === "GKP" && finite(player.price) <= controls.goalkeeperMaxPrice + 1e-9);
  return {
    chip_gw: chipGw,
    players,
    weekly,
    total: { ...shared.total, net_xpts: reportedTotal },
    squad_cost: squadCost,
    money_in_bank: moneyInBank,
    solver: shared.solver,
    objective: {
      type: "maximise_range_net_xpts_with_fixed_bench_boost_week",
      gw_from: gwFrom,
      gw_to: gwTo,
      bench_boost_gw: chipGw,
      primary_metric: "total.net_xpts",
      weekly_net_xpts_sum: weeklyNetXptsSum,
      reported_total_net_xpts: reportedTotal,
      arithmetic_verified: Math.abs(weeklyNetXptsSum - reportedTotal) <= 0.05,
      description: `Maximise total net xPTS across GW${gwFrom}-GW${gwTo} with Bench Boost fixed to GW${chipGw}.`,
    },
    constraints: {
      total_budget: controls.budget,
      minimum_money_in_bank: controls.minimumMoneyInBank,
      maximum_money_in_bank: controls.maximumMoneyInBank,
      exact_money_in_bank: controls.maximumMoneyInBank !== null && controls.maximumMoneyInBank === controls.minimumMoneyInBank
        ? controls.minimumMoneyInBank
        : null,
      maximum_squad_spend: controls.maximumSquadSpend,
      minimum_squad_spend: controls.minimumSquadSpend,
      actual_money_in_bank: moneyInBank,
      minimum_bench_spend: controls.minimumBenchSpend,
      minimum_bench_spend_enabled: controls.minimumBenchSpend > 0,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      derived_xi_ceiling: controls.maximumSquadSpend - controls.minimumBenchSpend,
      goalkeeper_price_constraint_enabled: controls.goalkeeperMaxPrice !== null,
      goalkeeper_max_price: controls.goalkeeperMaxPrice,
      minimum_goalkeepers_at_or_below_price: controls.minimumGoalkeepersAtOrBelowPrice,
      goalkeepers_at_or_below_price: cheapGoalkeepers,
      bench_order_policy: controls.benchOrderPolicy,
      max_per_club: 3,
      composition: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
    },
  };
}

async function deleteRequestedPlans(db, ids) {
  if (!ids.length) return [];
  const { data: rows, error: readError } = await db.from("plans").select("id,name,kind").in("id", ids);
  if (readError) throw new Error(`Could not read plans before deletion: ${readError.message}`);
  const byId = new Map((rows || []).map((row) => [String(row.id), row]));
  const live = (rows || []).filter((row) => row.kind === "live");
  if (live.length) throw new Error(`Refusing to delete live plan IDs: ${live.map((row) => row.id).join(",")}`);
  const deletable = (rows || []).map((row) => row.id);
  if (deletable.length) {
    const { error } = await db.from("plans").delete().in("id", deletable);
    if (error) throw new Error(`Could not delete requested plans: ${error.message}`);
    const { data: remaining, error: verifyError } = await db.from("plans").select("id").in("id", deletable);
    if (verifyError) throw new Error(`Could not verify requested plan deletion: ${verifyError.message}`);
    if ((remaining || []).length) throw new Error(`Requested plan deletion was incomplete: ${remaining.map((row) => row.id).join(",")}`);
  }
  return ids.map((id) => {
    const row = byId.get(String(id));
    return row ? { id, name: row.name, result: "deleted" } : { id, name: null, result: "not_found" };
  });
}

async function saveAndVerify(db, builds, requestedNames, ignoredPlanIds = []) {
  if (!requestedNames.length) return [];
  const ignored = new Set(ignoredPlanIds.map(String));
  const { data: existing, error: existingError } = await db.from("plans").select("id,name");
  if (existingError) throw new Error(`Could not check existing plan names: ${existingError.message}`);
  const usedNames = (existing || []).filter((row) => !ignored.has(String(row.id))).map((row) => row.name);
  const expectedRows = builds.map((build, index) => {
    const name = nextAvailablePlanName(requestedNames[index], usedNames);
    usedNames.push(name);
    const row = planRowFromBenchBoostBuild(build, name);
    const strictGameweeks = (build.weekly || []).map((week) => Number(week.gw));
    const validation = validatePlanWrite({ base: row.base, weeks: row.weeks, structure: row.structure, captain: row.captain, vice: row.vice, strictGameweeks });
    if (!validation.ok) throw new Error(`Generated plan ${name} failed pre-save validation: ${validation.errors.join("; ")}`);
    return row;
  });

  const { data: inserted, error: insertError } = await db.from("plans").insert(expectedRows).select("*");
  if (insertError) throw new Error(`Could not save comparison plans: ${insertError.message}`);
  const insertedIds = (inserted || []).map((row) => row.id);
  const { data: reread, error: readError } = await db.from("plans").select("*").in("id", insertedIds);
  if (readError) {
    if (insertedIds.length) await db.from("plans").delete().in("id", insertedIds);
    throw new Error(`Could not verify saved plans: ${readError.message}`);
  }
  const byId = new Map((reread || []).map((row) => [String(row.id), row]));
  const expectedByName = new Map(expectedRows.map((row) => [row.name, row]));
  const results = (inserted || []).map((row) => {
    const saved = byId.get(String(row.id));
    const expected = expectedByName.get(row.name);
    const verification = expected ? verifySavedPlan(saved, expected) : { ok: false };
    return { name: row.name, id: row.id, plan_id: row.id, verified: verification.ok, verification };
  });
  if (results.length !== expectedRows.length || results.some((row) => !row.verified)) {
    if (insertedIds.length) await db.from("plans").delete().in("id", insertedIds);
    const failed = results.filter((row) => !row.verified).map((row) => row.name).join(",") || "missing inserted rows";
    throw new Error(`Post-save canonical verification failed for ${failed}; newly inserted plans were removed.`);
  }
  return results.map(({ name, id, plan_id, verified }) => ({ name, id, plan_id, verified }));
}

export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Bad request body." }, 400); }
    const parsed = parseBody(body);
    if (!parsed.ok) return json(parsed, 400);

    const loaded = await loadForServer();
    const { players, scorer } = loaded;
    const exclusion = reconcilePlayerIdsAndNames({
      players,
      ids: parsed.excludePlayerIds,
      names: parsed.excludePlayerNames,
      label: "excluded player",
    });
    if (!exclusion.ok) {
      return json({
        ok: false,
        error: exclusion.error,
        excluded_player_resolution: exclusion.resolution?.players || [],
      }, 400);
    }
    const excludedPlayerIds = exclusion.ids;
    const playerById = new Map(players.map((player) => [idOf(player), player]));
    const excludedPlayers = excludedPlayerIds.map((id) => playerById.get(id));
    const pool = players.filter((player) => (!player.status || player.status === "a") && Number(player.price) > 0);
    const scoreForGw = (player, gw) => scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0;
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, parsed.gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);
    const replacementPool = pool.filter((player) => {
      try {
        const probability = startProbOf(player);
        return probability === null || probability === undefined || probability === ""
          || Number(probability) >= parsed.minimumStartProbability;
      } catch {
        return true;
      }
    });

    const controls = {
      budget: parsed.budget,
      minimumBenchSpend: parsed.minimumBenchSpend,
      minimumMoneyInBank: parsed.minimumMoneyInBank,
      maximumMoneyInBank: parsed.maximumMoneyInBank,
      maximumSquadSpend: parsed.maximumSquadSpend,
      minimumSquadSpend: parsed.minimumSquadSpend,
      goalkeeperMaxPrice: parsed.goalkeeperMaxPrice,
      minimumGoalkeepersAtOrBelowPrice: parsed.minimumGoalkeepersAtOrBelowPrice,
      benchOrderPolicy: parsed.benchOrderPolicy,
    };

    const builds = [];
    for (const chipGw of parsed.candidateChipGameweeks) {
      const shared = await buildExactSquadForRange({
        pool,
        scoreForGw,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        chipForGw: (gw) => gw === chipGw ? "benchboost" : null,
        transferHitForGw: () => 0,
        budget: parsed.budget,
        benchBudget: parsed.minimumBenchSpend,
        minimumMoneyInBank: parsed.minimumMoneyInBank,
        maximumMoneyInBank: parsed.maximumMoneyInBank,
        goalkeeperMaxPrice: parsed.goalkeeperMaxPrice,
        minimumGoalkeepersAtOrBelowPrice: parsed.minimumGoalkeepersAtOrBelowPrice,
        maxPerClub: 3,
        ignores: excludedPlayerIds,
        startProbOf,
        minStart: parsed.minimumStartProbability,
      });
      if (!shared.ok) return json({ ok: false, error: `GW${chipGw} build failed: ${shared.error}` }, 422);
      const build = publicBuild(shared, chipGw, controls, parsed.gwFrom, parsed.gwTo);
      if (parsed.suggestAlwaysBenchedReplacements) {
        build.always_benched_replacement_options = findAlwaysBenchedReplacementOptions({
          build,
          pool: replacementPool,
          scoreForGw,
          excludedPlayerIds,
          minimumBenchSpend: parsed.minimumBenchSpend,
          maximumMoneyInBank: parsed.maximumMoneyInBank,
          goalkeeperMaxPrice: parsed.goalkeeperMaxPrice,
          minimumGoalkeepersAtOrBelowPrice: parsed.minimumGoalkeepersAtOrBelowPrice,
          optionCount: parsed.replacementOptionCount,
          maximumComparableXptsDrop: parsed.replacementMaxXptsDrop,
          maxPerClub: 3,
        });
      } else {
        build.always_benched_replacement_options = [];
      }
      const validation = validateBuild(build, controls, parsed.gwFrom, parsed.gwTo, excludedPlayerIds);
      if (!validation.ok) return json({ ok: false, error: `GW${chipGw} build failed validation.`, validation }, 422);
      builds.push(build);
    }

    const excludedSet = new Set(excludedPlayerIds);
    const exclusionLeaks = builds.flatMap((build) =>
      (build.players || [])
        .map(idOf)
        .filter((id) => excludedSet.has(id))
        .map((id) => ({ chip_gw: build.chip_gw, player_id: id }))
    );
    if (exclusionLeaks.length) {
      return json({
        ok: false,
        error: "Hard exclusions were not preserved by every build. Nothing was saved or deleted.",
        requested_excluded_player_ids: excludedPlayerIds,
        exclusion_input_field: exclusion.source,
        exclusion_leaks: exclusionLeaks,
      }, 422);
    }

    const comparison = compareBenchBoostBuilds(builds);
    if ((comparison.ranking || []).some((row) => !row.arithmetic_verified)) {
      return json({ ok: false, error: "A build total did not equal the sum of its weekly net xPTS.", comparison }, 422);
    }

    let deleted = [];
    let saved = [];
    if (parsed.deletePlanIds.length || parsed.saveNames.length) {
      const db = admin();
      if (!db) return json({ ok: false, error: "Plan saving is not configured on this deployment yet." }, 503);
      try {
        saved = await saveAndVerify(db, builds, parsed.saveNames, parsed.deletePlanIds);
        deleted = await deleteRequestedPlans(db, parsed.deletePlanIds);
      } catch (error) {
        const newIds = saved.map((row) => row.id).filter(Boolean);
        if (newIds.length) await db.from("plans").delete().in("id", newIds);
        throw error;
      }
    }

    const objective = {
      type: "compare_fixed_bench_boost_week_across_range",
      gw_from: parsed.gwFrom,
      gw_to: parsed.gwTo,
      candidate_chip_gameweeks: builds.map((build) => build.chip_gw),
      minimum_bench_spend: parsed.minimumBenchSpend,
      minimum_bench_spend_enabled: parsed.minimumBenchSpend > 0,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      total_budget: parsed.budget,
      minimum_money_in_bank: parsed.minimumMoneyInBank,
      maximum_money_in_bank: parsed.maximumMoneyInBank,
      exact_money_in_bank: parsed.exactMoneyInBank,
      maximum_squad_spend: parsed.maximumSquadSpend,
      minimum_squad_spend: parsed.minimumSquadSpend,
      goalkeeper_max_price: parsed.goalkeeperMaxPrice,
      minimum_goalkeepers_at_or_below_price: parsed.minimumGoalkeepersAtOrBelowPrice,
      bench_order_policy: parsed.benchOrderPolicy,
      excluded_player_ids: excludedPlayerIds,
      excluded_player_resolution: exclusion.resolution,
      exclusion_input_field: exclusion.source,
      exclusions_verified_absent_from_all_builds: true,
      suggest_always_benched_replacements: parsed.suggestAlwaysBenchedReplacements,
      replacement_option_count: parsed.replacementOptionCount,
      replacement_max_xpts_drop: parsed.replacementMaxXptsDrop,
      primary_metric: "builds[].total.net_xpts",
      explanation: `Each build is independently optimised for total net xPTS across GW${parsed.gwFrom}-GW${parsed.gwTo}; only the fixed Bench Boost gameweek changes.`,
      proof_fields: [
        "builds[].objective.gw_from",
        "builds[].objective.gw_to",
        "builds[].objective.bench_boost_gw",
        "builds[].weekly[].net_xpts",
        "builds[].objective.weekly_net_xpts_sum",
        "builds[].total.net_xpts",
        "builds[].objective.arithmetic_verified",
        "builds[].squad_cost",
        "builds[].money_in_bank",
        "builds[].constraints.goalkeepers_at_or_below_price",
        "builds[].weekly[].bench_order",
      ],
    };
    const reportMarkdown = renderBenchBoostReport({
      gwFrom: parsed.gwFrom,
      gwTo: parsed.gwTo,
      builds,
      comparison,
      deleted,
      saved,
      excludedPlayers,
    });

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      gw_from: parsed.gwFrom,
      gw_to: parsed.gwTo,
      total_budget: parsed.budget,
      minimum_money_in_bank: parsed.minimumMoneyInBank,
      maximum_money_in_bank: parsed.maximumMoneyInBank,
      exact_money_in_bank: parsed.exactMoneyInBank,
      maximum_squad_spend: parsed.maximumSquadSpend,
      minimum_squad_spend: parsed.minimumSquadSpend,
      minimum_bench_spend: parsed.minimumBenchSpend,
      minimum_bench_spend_enabled: parsed.minimumBenchSpend > 0,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      goalkeeper_max_price: parsed.goalkeeperMaxPrice,
      minimum_goalkeepers_at_or_below_price: parsed.minimumGoalkeepersAtOrBelowPrice,
      bench_order_policy: parsed.benchOrderPolicy,
      excluded_player_ids: excludedPlayerIds,
      excluded_player_resolution: exclusion.resolution,
      exclusion_input_field: exclusion.source,
      exclusions_verified_absent_from_all_builds: true,
      objective,
      deleted,
      builds,
      comparison,
      saved,
      report_markdown: reportMarkdown,
      errors: [],
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
