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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
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
  const saveNames = Array.isArray(body?.save_names) ? body.save_names.map((name) => String(name || "").trim()) : [];
  if (saveNames.length && saveNames.length !== (gwTo - gwFrom + 1)) {
    return { ok: false, error: "save_names must contain exactly one name for every candidate Bench Boost gameweek." };
  }
  const deletePlanIds = [...new Set((Array.isArray(body?.delete_plan_ids) ? body.delete_plan_ids : [])
    .map((id) => String(id || "").trim()).filter(Boolean))];
  return { ok: true, gwFrom, gwTo, budget, saveNames, deletePlanIds };
}

function validateBuild(build, budget, gwFrom, gwTo) {
  const errors = [];
  const players = build.players || [];
  const ids = players.map(idOf);
  if (players.length !== 15) errors.push(`expected 15 players, received ${players.length}`);
  if (new Set(ids).size !== 15) errors.push("player IDs are not unique");
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
  const actualWeeks = (build.weekly || []).map((week) => Number(week.gw));
  if (JSON.stringify(actualWeeks) !== JSON.stringify(expectedWeeks)) {
    errors.push(`weekly range is ${actualWeeks.join(",") || "missing"}, expected ${expectedWeeks.join(",")}`);
  }
  for (const week of build.weekly || []) {
    const xiCost = sumCost(week.starters || []);
    const benchCost = sumCost(week.bench || []);
    if ((week.starters || []).length !== 11) errors.push(`GW${week.gw} does not have 11 starters`);
    if ((week.bench || []).length !== 4) errors.push(`GW${week.gw} does not have four bench players`);
    if (xiCost > budget - 17 + 1e-9) errors.push(`GW${week.gw} XI costs ${xiCost.toFixed(1)}, above ${(budget - 17).toFixed(1)}`);
    if (benchCost < 17 - 1e-9) errors.push(`GW${week.gw} bench costs ${benchCost.toFixed(1)}, below 17.0`);
  }
  const chipWeeks = (build.weekly || []).filter((week) => week.chip === "benchboost").map((week) => Number(week.gw));
  if (chipWeeks.length !== 1 || chipWeeks[0] !== Number(build.chip_gw)) {
    errors.push(`Bench Boost schedule is ${chipWeeks.join(",") || "missing"}, expected GW${build.chip_gw}`);
  }
  if (build?.solver?.status !== "OPTIMAL" || build?.solver?.optimality_proven !== true || Number(build?.solver?.mip_gap) !== 0) {
    errors.push("exact global optimality proof is missing");
  }
  if (!build.objective?.arithmetic_verified) {
    errors.push(`weekly net xPTS sum ${build.objective?.weekly_net_xpts_sum} does not match total ${build.total?.net_xpts}`);
  }
  return { ok: errors.length === 0, errors };
}

function publicBuild(shared, chipGw, budget, gwFrom, gwTo) {
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
      xi_budget: budget - 17,
      bench_budget: 17,
      bench_budget_rule: "minimum",
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
  const deletable = (rows || []).filter((row) => row.kind !== "live");
  if (deletable.length) {
    const { error } = await db.from("plans").delete().in("id", deletable.map((row) => row.id));
    if (error) throw new Error(`Could not delete requested plans: ${error.message}`);
  }
  return ids.map((id) => {
    const row = byId.get(String(id));
    if (!row) return { id, name: null, result: "not_found" };
    if (row.kind === "live") return { id, name: row.name, result: "skipped_live" };
    return { id, name: row.name, result: "deleted" };
  });
}

async function saveAndVerify(db, builds, requestedNames) {
  if (!requestedNames.length) return [];
  const { data: existing, error: existingError } = await db.from("plans").select("name");
  if (existingError) throw new Error(`Could not check existing plan names: ${existingError.message}`);
  const usedNames = (existing || []).map((row) => row.name);
  const expectedRows = builds.map((build, index) => {
    const name = nextAvailablePlanName(requestedNames[index], usedNames);
    usedNames.push(name);
    return planRowFromBenchBoostBuild(build, name);
  });
  const { data: inserted, error: insertError } = await db.from("plans").insert(expectedRows).select("*");
  if (insertError) throw new Error(`Could not save comparison plans: ${insertError.message}`);
  const insertedIds = (inserted || []).map((row) => row.id);
  const { data: reread, error: readError } = await db.from("plans").select("*").in("id", insertedIds);
  if (readError) throw new Error(`Could not verify saved plans: ${readError.message}`);
  const byId = new Map((reread || []).map((row) => [String(row.id), row]));
  const results = (inserted || []).map((row, index) => {
    const saved = byId.get(String(row.id));
    const verification = verifySavedPlan(saved, expectedRows[index]);
    return { name: row.name, id: row.id, plan_id: row.id, verified: verification.ok, verification };
  });
  if (results.some((row) => !row.verified)) {
    await db.from("plans").delete().in("id", insertedIds);
    throw new Error("Post-save verification failed; the newly inserted plans were removed.");
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
    const pool = players.filter((player) => (!player.status || player.status === "a") && Number(player.price) > 0);
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, parsed.gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);

    const builds = [];
    for (let chipGw = parsed.gwFrom; chipGw <= parsed.gwTo; chipGw += 1) {
      const shared = await buildExactSquadForRange({
        pool,
        scoreForGw: (player, gw) => scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        chipForGw: (gw) => gw === chipGw ? "benchboost" : null,
        transferHitForGw: () => 0,
        budget: parsed.budget,
        benchBudget: 17,
        maxPerClub: 3,
        startProbOf,
        minStart: 0.55,
      });
      if (!shared.ok) return json({ ok: false, error: `GW${chipGw} build failed: ${shared.error}` }, 422);
      const build = publicBuild(shared, chipGw, parsed.budget, parsed.gwFrom, parsed.gwTo);
      const validation = validateBuild(build, parsed.budget, parsed.gwFrom, parsed.gwTo);
      if (!validation.ok) return json({ ok: false, error: `GW${chipGw} build failed validation.`, validation }, 422);
      builds.push(build);
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
      deleted = await deleteRequestedPlans(db, parsed.deletePlanIds);
      saved = await saveAndVerify(db, builds, parsed.saveNames);
    }

    const objective = {
      type: "compare_fixed_bench_boost_week_across_range",
      gw_from: parsed.gwFrom,
      gw_to: parsed.gwTo,
      candidate_chip_gameweeks: builds.map((build) => build.chip_gw),
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
    });

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      gw_from: parsed.gwFrom,
      gw_to: parsed.gwTo,
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
