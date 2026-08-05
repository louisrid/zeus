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
import { validatePlanWrite } from "../../../lib/plan-write-validation.mjs";
import { parseMinimumBenchSpend } from "../../../lib/minimum-bench-spend.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  const rawExcludePlayerIds = Array.isArray(body?.exclude_player_ids) ? body.exclude_player_ids.map(Number) : [];
  if (rawExcludePlayerIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, error: "exclude_player_ids must contain positive integer player IDs." };
  }
  const excludePlayerIds = [...new Set(rawExcludePlayerIds)];
  return { ok: true, gwFrom, gwTo, budget, minimumBenchSpend, candidateChipGameweeks, saveNames, deletePlanIds, excludePlayerIds };
}

function validateBuild(build, budget, minimumBenchSpend, gwFrom, gwTo) {
  const errors = [];
  const players = Array.isArray(build?.players) ? build.players : [];
  const squadIds = players.map(idOf);
  const squadSet = new Set(squadIds);
  if (players.length !== 15) errors.push(`expected 15 players, received ${players.length}`);
  if (squadSet.size !== 15 || squadIds.some((id) => !Number.isInteger(id) || id <= 0)) errors.push("player IDs are not 15 unique positive integers");

  const quotas = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  for (const [position, expected] of Object.entries(quotas)) {
    const count = players.filter((player) => player.position === position).length;
    if (count !== expected) errors.push(`${position} count is ${count}, expected ${expected}`);
  }
  const clubs = new Map();
  for (const player of players) clubs.set(Number(player.team_id), (clubs.get(Number(player.team_id)) || 0) + 1);
  for (const [teamId, count] of clubs) if (count > 3) errors.push(`club ${teamId} has ${count} players`);
  if (sumCost(players) > budget + 1e-9) errors.push(`squad cost ${sumCost(players).toFixed(1)} exceeds ${budget.toFixed(1)}`);

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
    const overlap = starterIds.filter((id) => benchSet.has(id));
    if (overlap.length) errors.push(`GW${gw} XI/bench overlap: ${overlap.join(",")}`);
    const union = new Set([...starterIds, ...benchIds]);
    if (union.size !== 15 || [...squadSet].some((id) => !union.has(id))) errors.push(`GW${gw} XI and bench do not equal the fixed squad`);
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
    if (xiCost > budget - minimumBenchSpend + 1e-9) errors.push(`GW${gw} XI costs ${xiCost.toFixed(1)}, above the derived ceiling ${(budget - minimumBenchSpend).toFixed(1)}`);
    if (benchCost < minimumBenchSpend - 1e-9) errors.push(`GW${gw} bench costs ${benchCost.toFixed(1)}, below the required minimum ${minimumBenchSpend.toFixed(1)}`);
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

function publicBuild(shared, chipGw, budget, minimumBenchSpend, gwFrom, gwTo) {
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
  return {
    chip_gw: chipGw,
    players,
    weekly,
    total: { ...shared.total, net_xpts: reportedTotal },
    squad_cost: rounded(sumCost(players)),
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
      total_budget: budget,
      minimum_bench_spend: minimumBenchSpend,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      derived_xi_ceiling: budget - minimumBenchSpend,
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
    const playerById = new Map(players.map((player) => [idOf(player), player]));
    const unknownExclusions = parsed.excludePlayerIds.filter((id) => !playerById.has(id));
    if (unknownExclusions.length) {
      return json({ ok: false, error: `Unknown excluded player IDs: ${unknownExclusions.join(",")}.` }, 400);
    }
    const excludedPlayers = parsed.excludePlayerIds.map((id) => playerById.get(id));
    const pool = players.filter((player) => (!player.status || player.status === "a") && Number(player.price) > 0);
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, parsed.gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);

    const builds = [];
    for (const chipGw of parsed.candidateChipGameweeks) {
      const shared = await buildExactSquadForRange({
        pool,
        scoreForGw: (player, gw) => scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        chipForGw: (gw) => gw === chipGw ? "benchboost" : null,
        transferHitForGw: () => 0,
        budget: parsed.budget,
        benchBudget: parsed.minimumBenchSpend,
        maxPerClub: 3,
        ignores: parsed.excludePlayerIds,
        startProbOf,
        minStart: 0.55,
      });
      if (!shared.ok) return json({ ok: false, error: `GW${chipGw} build failed: ${shared.error}` }, 422);
      const build = publicBuild(shared, chipGw, parsed.budget, parsed.minimumBenchSpend, parsed.gwFrom, parsed.gwTo);
      const validation = validateBuild(build, parsed.budget, parsed.minimumBenchSpend, parsed.gwFrom, parsed.gwTo);
      if (!validation.ok) return json({ ok: false, error: `GW${chipGw} build failed validation.`, validation }, 422);
      builds.push(build);
    }

    const wrongMinimum = builds.filter((build) =>
      Number(build?.constraints?.minimum_bench_spend) !== parsed.minimumBenchSpend
      || build?.constraints?.bench_spend_rule !== "at_least"
      || build?.constraints?.bench_spend_can_exceed_minimum !== true);
    if (wrongMinimum.length) {
      return json({
        ok: false,
        error: "The backend did not preserve the explicitly requested minimum bench-spend floor. Nothing was saved or deleted.",
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
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      excluded_player_ids: parsed.excludePlayerIds,
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
      minimum_bench_spend: parsed.minimumBenchSpend,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      excluded_player_ids: parsed.excludePlayerIds,
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
