import { loadForServer } from "../../../lib/server/load.mjs";
import { buildExactSquadForRange } from "../../../lib/server/exact-range-optimiser.mjs";
import { parseMinimumBenchSpend } from "../../../lib/minimum-bench-spend.mjs";
import { parseExcludedPlayerIds } from "../../../lib/excluded-player-ids.mjs";
import { reconcilePlayerIdsAndNames } from "../../../lib/server/player-name-resolution.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ids = (value) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isFinite))];
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function optionalFinite(body, keys, fallback = null) {
  for (const key of keys) {
    const value = body?.[key];
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return fallback;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const gwFrom = Number(body?.gw_from);
    const gwTo = Number(body?.gw_to);
    const budget = finite(body?.budget, 100);
    const minimumResult = parseMinimumBenchSpend(body, {
      budget,
      required: false,
      defaultValue: 16.5,
    });
    if (!minimumResult.ok) return Response.json(minimumResult, { status: 400 });
    const minimumBenchSpend = minimumResult.value;

    let minimumMoneyInBank = optionalFinite(body,
      ["minimum_money_in_bank", "money_in_bank", "leave_in_bank", "bank"], 0);
    let maximumMoneyInBank = optionalFinite(body, ["maximum_money_in_bank"], null);
    const exactMoneyInBank = optionalFinite(body, ["exact_money_in_bank"], null);
    if (exactMoneyInBank !== null) {
      if (!Number.isFinite(exactMoneyInBank) || exactMoneyInBank < 0 || exactMoneyInBank >= budget) {
        return Response.json({ ok: false, error: "exact_money_in_bank must be at least 0 and lower than the total budget." }, { status: 400 });
      }
      const explicitMinimum = body?.minimum_money_in_bank ?? body?.money_in_bank ?? body?.leave_in_bank ?? body?.bank;
      if (explicitMinimum !== undefined && Number(explicitMinimum) !== exactMoneyInBank) {
        return Response.json({ ok: false, error: "exact_money_in_bank conflicts with the supplied minimum money-in-bank value." }, { status: 400 });
      }
      if (maximumMoneyInBank !== null && maximumMoneyInBank !== exactMoneyInBank) {
        return Response.json({ ok: false, error: "exact_money_in_bank conflicts with maximum_money_in_bank." }, { status: 400 });
      }
      minimumMoneyInBank = exactMoneyInBank;
      maximumMoneyInBank = exactMoneyInBank;
    }
    if (!Number.isFinite(minimumMoneyInBank) || minimumMoneyInBank < 0 || minimumMoneyInBank >= budget) {
      return Response.json({ ok: false, error: "minimum_money_in_bank must be at least 0 and lower than the total budget." }, { status: 400 });
    }
    if (maximumMoneyInBank !== null
      && (!Number.isFinite(maximumMoneyInBank) || maximumMoneyInBank < minimumMoneyInBank || maximumMoneyInBank >= budget)) {
      return Response.json({ ok: false, error: "maximum_money_in_bank must be at least the minimum and lower than the total budget." }, { status: 400 });
    }
    if (minimumBenchSpend > budget - minimumMoneyInBank) {
      return Response.json({ ok: false, error: "minimum_bench_spend cannot exceed the spendable budget after reserving money in the bank." }, { status: 400 });
    }

    const goalkeeperMaxPrice = optionalFinite(body,
      ["goalkeeper_max_price", "max_goalkeeper_price"], null);
    if (Number.isNaN(goalkeeperMaxPrice) || (goalkeeperMaxPrice !== null && goalkeeperMaxPrice <= 0)) {
      return Response.json({ ok: false, error: "goalkeeper_max_price must be a positive number when supplied." }, { status: 400 });
    }
    const minimumGoalkeepersAtOrBelowPrice = goalkeeperMaxPrice === null
      ? 0
      : Number(body?.minimum_goalkeepers_at_or_below_price ?? 1);
    if (goalkeeperMaxPrice !== null
      && (!Number.isInteger(minimumGoalkeepersAtOrBelowPrice)
        || minimumGoalkeepersAtOrBelowPrice < 1
        || minimumGoalkeepersAtOrBelowPrice > 2)) {
      return Response.json({ ok: false, error: "minimum_goalkeepers_at_or_below_price must be 1 or 2." }, { status: 400 });
    }

    const exclusionResult = parseExcludedPlayerIds(body);
    if (!exclusionResult.ok) return Response.json(exclusionResult, { status: 400 });
    const excludePlayerNamesRaw = body?.excluded_player_names ?? body?.exclude_player_names ?? [];
    if (!Array.isArray(excludePlayerNamesRaw)) {
      return Response.json({ ok: false, error: "excluded_player_names must be an array when supplied." }, { status: 400 });
    }

    const lockNamesRaw = body?.locked_player_names ?? [];
    if (!Array.isArray(lockNamesRaw)) {
      return Response.json({ ok: false, error: "locked_player_names must be an array when supplied." }, { status: 400 });
    }
    const lockNamesText = body?.locked_player_names_text;
    const keepNamesRaw = body?.keep_player_names ?? body?.include_player_names ?? [];
    if (!Array.isArray(keepNamesRaw)) {
      return Response.json({ ok: false, error: "keep_player_names must be an array when supplied." }, { status: 400 });
    }
    const keepNamesText = body?.keep_player_names_text ?? body?.include_player_names_text;
    if (lockNamesText !== undefined && lockNamesText !== null && typeof lockNamesText !== "string") {
      return Response.json({ ok: false, error: "locked_player_names_text must be a delimited string." }, { status: 400 });
    }
    const cleanNames = (arr, text) => [...new Set([
      ...arr,
      ...(typeof text === "string" ? text.split(/[,;\n|]+/) : []),
    ].map((n) => String(n ?? "").trim()).filter((n) => n.length > 0
      && !["none","null","nil","undefined","nan","n/a","na","-","[]"].includes(n.toLowerCase())))];
    const keepNames = cleanNames(keepNamesRaw, keepNamesText);
    const lockNames = [...new Set([
      ...lockNamesRaw,
      ...(typeof lockNamesText === "string" ? lockNamesText.split(/[,;\n|]+/) : []),
    ].map((n) => String(n ?? "").trim()).filter((n) => n.length > 0
      && !["none","null","nil","undefined","nan","n/a","na","-","[]"].includes(n.toLowerCase())))];

    const chipSchedule = body?.chip_schedule && typeof body.chip_schedule === "object" ? body.chip_schedule : {};
    const transferHits = body?.transfer_hits && typeof body.transfer_hits === "object" ? body.transfer_hits : {};
    const minimumStartProbability = Number(body?.minimum_start_probability ?? 0.55);
    if (!Number.isFinite(minimumStartProbability) || minimumStartProbability < 0 || minimumStartProbability > 1) {
      return Response.json({ ok: false, error: "minimum_start_probability must be between 0 and 1." }, { status: 400 });
    }

    const loaded = await loadForServer();
    const { players, scorer } = loaded;
    const exclusion = reconcilePlayerIdsAndNames({
      players,
      ids: exclusionResult.value,
      names: excludePlayerNamesRaw,
      label: "excluded player",
    });
    if (!exclusion.ok) {
      return Response.json({
        ok: false,
        error: exclusion.error,
        excluded_player_resolution: exclusion.resolution?.players || [],
      }, { status: 400 });
    }

    const lockResolution = reconcilePlayerIdsAndNames({
      players,
      ids: ids(body?.locks),
      names: lockNames,
      label: "locked player",
    });
    if (!lockResolution.ok) {
      return Response.json({
        ok: false,
        error: lockResolution.error,
        locked_player_resolution: lockResolution.resolution?.players || [],
      }, { status: 400 });
    }
    const lockedPlayerIds = lockResolution.ids;
    const keepResolution = reconcilePlayerIdsAndNames({
      players,
      ids: ids(body?.keep),
      names: keepNames,
      label: "kept player",
    });
    if (!keepResolution.ok) {
      return Response.json({
        ok: false,
        error: keepResolution.error,
        kept_player_resolution: keepResolution.resolution?.players || [],
      }, { status: 400 });
    }
    const keptPlayerIds = keepResolution.ids.filter((id) => !lockedPlayerIds.includes(id));
    const lockExcludeClash = [...lockedPlayerIds, ...keptPlayerIds].filter((id) => exclusion.ids.includes(id));
    if (lockExcludeClash.length) {
      return Response.json({
        ok: false,
        error: `These players are both required and excluded: ${lockExcludeClash.join(",")}.`,
      }, { status: 400 });
    }
    if (lockedPlayerIds.length > 11) {
      return Response.json({ ok: false, error: "Cannot lock more than 11 players into the starting XI." }, { status: 400 });
    }
    if (lockedPlayerIds.length + keptPlayerIds.length > 15) {
      return Response.json({ ok: false, error: "Locked plus kept players cannot exceed the 15-player squad." }, { status: 400 });
    }

    const pool = players.filter((player) => Number(player.price) > 0);
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);
    const result = await buildExactSquadForRange({
      pool,
      scoreForGw: (player, gw) => scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0,
      gwFrom,
      gwTo,
      chipForGw: (gw) => chipSchedule[gw] || chipSchedule[String(gw)] || null,
      transferHitForGw: (gw) => finite(transferHits[gw] ?? transferHits[String(gw)], 0),
      locks: lockedPlayerIds,
      keep: keptPlayerIds,
      ignores: exclusion.ids,
      budget,
      benchBudget: minimumBenchSpend,
      minimumMoneyInBank,
      maximumMoneyInBank,
      goalkeeperMaxPrice,
      minimumGoalkeepersAtOrBelowPrice,
      maxPerClub: 3,
      startProbOf,
      minStart: minimumStartProbability,
      onlyFormation: body?.only_formation || null,
    });
    if (!result.ok) return Response.json(result, { status: 422 });
    if (result.solver?.status !== "OPTIMAL" || result.solver?.optimality_proven !== true || result.solver?.mip_gap !== 0) {
      return Response.json({ ok: false, error: "The exact optimiser did not prove global optimality." }, { status: 422 });
    }
    return Response.json({
      ...result,
      total_budget: budget,
      minimum_money_in_bank: minimumMoneyInBank,
      maximum_money_in_bank: maximumMoneyInBank,
      exact_money_in_bank: exactMoneyInBank,
      maximum_squad_spend: budget - minimumMoneyInBank,
      minimum_squad_spend: maximumMoneyInBank === null ? null : budget - maximumMoneyInBank,
      money_in_bank: result.moneyInBank,
      minimum_bench_spend: minimumBenchSpend,
      minimum_bench_spend_enabled: minimumBenchSpend > 0,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
      goalkeeper_max_price: goalkeeperMaxPrice,
      minimum_goalkeepers_at_or_below_price: minimumGoalkeepersAtOrBelowPrice,
      bench_order_policy: result.benchOrderPolicy,
      locked_player_ids: lockedPlayerIds,
      kept_player_ids: keptPlayerIds,
      locked_player_resolution: lockResolution.resolution,
      excluded_player_ids: exclusion.ids,
      excluded_player_resolution: exclusion.resolution,
      exclusion_input_field: exclusion.source,
      exclusions_verified_absent_from_build: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
