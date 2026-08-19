/* Read-only theoretical squad optimiser.
 *
 * Exact gw_from/gw_to requests are supported across the canonical external-xPTS horizon, GW1-GW8.
 * The existing weeks=N behaviour remains available for callers that intentionally begin at the current
 * ZEUS gameweek. JSON is the stable tool contract; plain text remains available for existing human use.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import { DEFAULT_MINIMUM_BENCH_SPEND, parseMinimumBenchSpend } from "../../../lib/minimum-bench-spend.mjs";
import { blanksAndDoubles } from "../../../lib/server/fixtures.mjs";
import { bestXI } from "../../../lib/solver/autobuild.mjs";
import { bestFifteenAllPlaying, optimiseSquad } from "../../../lib/solver/optimise.mjs";
import { buildExactSquadForRange } from "../../../lib/server/exact-range-optimiser.mjs";
import { parseOptimiseRequest, OPTIMISE_GW_MIN, OPTIMISE_GW_MAX } from "../../../lib/optimise-request.mjs";
import { optimiseOwnedSquadRange } from "../../../lib/squad-range.mjs";
import { reconcilePlayerIdsAndNames } from "../../../lib/server/player-name-resolution.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const sumCost = (players) => players.reduce((sum, player) => sum + finite(player.price), 0);

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(requestedFormat, message, status = 400, details = {}) {
  if (requestedFormat === "json") return json({ ok: false, error: message, ...details }, status);
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function clubCounts(players) {
  const counts = {};
  for (const player of players) {
    const key = String(player.team || player.team_id || "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function composition(players) {
  return Object.fromEntries(["GKP", "DEF", "MID", "FWD"].map((position) => [
    position,
    players.filter((player) => player.position === position).length,
  ]));
}

function serializePlayer(player, rangeXpts, role) {
  return {
    fpl_id: Number(player.fpl_id),
    web_name: player.web_name,
    position: player.position,
    team: player.team,
    team_id: Number(player.team_id),
    price: finite(player.price),
    ownership: finite(player.own),
    role,
    range_xpts: finite(rangeXpts),
  };
}

function plainText(payload) {
  const lines = [];
  lines.push(`OPTIMISE, mode ${payload.mode}, GW${payload.gw_from} to GW${payload.gw_to}, budget ${n1(payload.constraints.total_budget)}`);
  lines.push(`Generated ${payload.generated_at.replace("T", " ").slice(0, 16)} UTC.`);
  lines.push("");
  lines.push(`THEORETICAL SQUAD`);
  lines.push(`  spent ${n1(payload.squad.total_cost)}: XI ${n1(payload.squad.xi_cost)}, bench ${n1(payload.squad.bench_cost)}`);
  for (const player of payload.squad.players.filter((item) => item.role === "starter")) {
    lines.push(`  XI  ${player.web_name}, ${player.position}, ${player.team}, ${n1(player.price)}, ${n1(player.range_xpts)} xPTS`);
  }
  for (const player of payload.squad.players.filter((item) => item.role === "bench")) {
    lines.push(`  BEN ${player.web_name}, ${player.position}, ${player.team}, ${n1(player.price)}, ${n1(player.range_xpts)} xPTS`);
  }
  lines.push("");
  lines.push(`WEEKLY DECISIONS`);
  for (const week of payload.weekly) {
    const captain = [...week.starters, ...week.bench].find((player) => player.fpl_id === week.captain);
    lines.push(`  GW${week.gw}: ${week.formation}, captain ${captain?.web_name || "—"}, chip ${week.chip || "none"}, gross ${n1(week.gross_xpts)}, net ${n1(week.net_xpts)}`);
  }
  lines.push("");
  lines.push(`TOTAL RANGE xPTS: ${n1(payload.total.net_xpts)}`);
  lines.push(`xPTS comes from the canonical external GW1-GW8 import after predicted-lineup gating.`);
  return lines.join("\n");
}

export async function GET(request) {
  let requestedFormat = "text";
  try {
    const url = new URL(request.url);
    requestedFormat = String(url.searchParams.get("format") || "text").toLowerCase() === "json" ? "json" : "text";
    const loaded = await loadForServer();
    const parsed = parseOptimiseRequest(url.searchParams, { currentGw: loaded.gw });
    if (!parsed.ok) return errorResponse(requestedFormat, parsed.error, parsed.status);
    requestedFormat = parsed.format;

    /* The bench floor was a constant here while /api/exact-squad parsed it properly, so the same rule was
       adjustable through one door and fixed through the other. It is a request parameter on both now,
       sharing one parser, one default and one set of validation messages. */
    const benchRaw = url.searchParams.get("minimum_bench_spend");
    const benchParsed = parseMinimumBenchSpend(
      benchRaw === null ? {} : { minimum_bench_spend: benchRaw },
      { budget: parsed.budget, required: false, defaultValue: DEFAULT_MINIMUM_BENCH_SPEND },
    );
    if (!benchParsed.ok) return errorResponse(parsed.format, benchParsed.error, 400);
    const minimumBenchSpend = benchParsed.value;

    if (parsed.mode === "xi") {
      return errorResponse(parsed.format,
        "Mode xi reorders an existing owned squad, but this endpoint was not given one. Use mode=squad for a new theoretical 15.",
        400,
        { mode: parsed.mode, gw_from: parsed.gwFrom, gw_to: parsed.gwTo });
    }
    const scheduledChips = Object.keys(parsed.chipSchedule);
    if (parsed.mode === "fifteen" && scheduledChips.length) {
      return errorResponse(parsed.format,
        "Mode fifteen is the non-chip all-playing comparator. Use mode=squad for chip-aware theoretical selection.",
        409,
        { mode: parsed.mode, gw_from: parsed.gwFrom, gw_to: parsed.gwTo, chip_schedule: parsed.chipSchedule });
    }
    const { teamRows, teamById, players, fixtures, scorer, lineupGate } = loaded;
    const rangeXpts = (player) => {
      let total = 0;
      for (let gw = parsed.gwFrom; gw <= parsed.gwTo; gw += 1) {
        total += finite(scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0);
      }
      return total;
    };
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, parsed.gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);
    const keepResolution = reconcilePlayerIdsAndNames({
      players, ids: [], names: parsed.keepPlayerNames, label: "kept player",
    });
    if (!keepResolution.ok) return errorResponse(parsed.format, keepResolution.error, 400);
    const lockResolution = reconcilePlayerIdsAndNames({
      players, ids: [], names: parsed.lockedPlayerNames, label: "locked player",
    });
    if (!lockResolution.ok) return errorResponse(parsed.format, lockResolution.error, 400);
    const lockedPlayerIds = lockResolution.ids;
    const keptPlayerIds = keepResolution.ids.filter((id) => !lockedPlayerIds.includes(id));
    const requiredIds = new Set([...lockedPlayerIds, ...keptPlayerIds]);
    const idOfPlayer = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
    const exclusionResolution = reconcilePlayerIdsAndNames({
      players,
      ids: parsed.excludedPlayerIds,
      names: parsed.excludedPlayerNames,
      label: "excluded player",
    });
    if (!exclusionResolution.ok) return errorResponse(parsed.format, exclusionResolution.error, 400);
    const excludedPlayerIds = exclusionResolution.ids;
    const excludedSet = new Set(excludedPlayerIds);
    const requiredExcludedClash = [...requiredIds].filter((id) => excludedSet.has(id));
    if (requiredExcludedClash.length) {
      return errorResponse(parsed.format,
        `These players are both required and excluded: ${requiredExcludedClash.join(",")}.`, 400);
    }
    const pool = players.filter((player) => Number(player.price) > 0
      && !excludedSet.has(idOfPlayer(player))
      && (requiredIds.has(idOfPlayer(player)) || !player.status || player.status === "a"));

    /* Allow-list. Cuts the candidate pool to a shortlist. Composes with everything
       else: kept and locked players are always allowed through, exclusions still
       win, and every price or spend constraint applies to whatever survives. */
    let currentSquadIds = [];
    if (parsed.currentSquadNames && parsed.currentSquadNames.length) {
      const cur = reconcilePlayerIdsAndNames({
        players, ids: [], names: parsed.currentSquadNames, label: "current squad player",
      });
      if (!cur.ok) return errorResponse(parsed.format, cur.error, 400);
      currentSquadIds = cur.ids;
    }
    let onlyPlayerIds = null;
    let onlyResolution = null;
    let poolFinal = pool;
    if (parsed.onlyPlayerNames && parsed.onlyPlayerNames.length) {
      onlyResolution = reconcilePlayerIdsAndNames({
        players, ids: [], names: parsed.onlyPlayerNames, label: "pool player",
      });
      if (!onlyResolution.ok) return errorResponse(parsed.format, onlyResolution.error, 400);
      // A player you have forced in is part of the pool by definition.
      // Your own squad is always selectable, otherwise a change limit is unsatisfiable.
      const allowed = new Set([...onlyResolution.ids, ...requiredIds, ...currentSquadIds]);
      for (const id of excludedPlayerIds) allowed.delete(id);
      onlyPlayerIds = [...allowed];
      poolFinal = pool.filter((player) => allowed.has(idOfPlayer(player)));

      const need = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
      const have = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const player of poolFinal) {
        if (have[player.position] !== undefined) have[player.position] += 1;
      }
      const short = Object.keys(need)
        .filter((k) => have[k] < need[k])
        .map((k) => `${k} ${have[k]}/${need[k]}`);
      if (short.length) {
        return errorResponse(parsed.format,
          `The player pool cannot form a legal 15-man squad. Short of: ${short.join(", ")}. `
          + `Add more names, or drop only_player_names to use the full pool.`, 400);
      }
    }
    const missingRequired = [...requiredIds].filter((id) => !poolFinal.some((player) => idOfPlayer(player) === id));
    if (missingRequired.length) {
      return errorResponse(parsed.format,
        `Required players are not in the selectable pool: ${missingRequired.join(",")}.`, 400);
    }
    if (requiredIds.size && parsed.mode !== "squad" && parsed.mode !== "benchboost") {
      return errorResponse(parsed.format,
        `Required players are only supported in mode=squad. Received mode=${parsed.mode}.`, 400);
    }

    let built;
    let range;
    let solverProof = null;
    if (parsed.mode === "squad" || parsed.mode === "benchboost") {
      const shared = await buildExactSquadForRange({
        pool: poolFinal,
        scoreForGw: (player, gameweek) => scorer.scoreForGw ? scorer.scoreForGw(player, gameweek) : 0,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        chipForGw: (gameweek) => parsed.chipSchedule[gameweek] || null,
        transferHitForGw: (gameweek) => parsed.transferHits[gameweek] || 0,
        budget: parsed.budget,
        benchBudget: minimumBenchSpend,
        maxPerClub: 3,
        locks: lockedPlayerIds,
        lockGameweeks: parsed.lockGameweeks,
        keep: keptPlayerIds,
        startProbOf,
        minStart: 0.55,
        currentSquad: currentSquadIds,
        squadRules: parsed.squadRules,
        maximumChanges: parsed.maximumChanges,
        maximumGoalkeeperSpend: parsed.maximumGoalkeeperSpend,
        goalkeeperMaxPrice: parsed.goalkeeperMaxPrice,
        minimumGoalkeepersAtOrBelowPrice: parsed.minimumGoalkeepersAtOrBelowPrice,
        minimumPriceByPosition: parsed.minimumPriceByPosition,
        maximumPriceByPosition: parsed.maximumPriceByPosition,
        maximumSpendByPosition: parsed.maximumSpendByPosition,
      });
      if (!shared.ok) return errorResponse(parsed.format, shared.error, 422);
      const builtIds = new Set([...(shared.xi || []), ...(shared.bench || [])].map(idOfPlayer));
      const dropped = [...requiredIds].filter((id) => !builtIds.has(id));
      if (dropped.length) {
        return errorResponse(parsed.format, `Build omitted required players: ${dropped.join(",")}.`, 422);
      }
      if (shared.solver?.status !== "OPTIMAL" || shared.solver?.optimality_proven !== true || shared.solver?.mip_gap !== 0) return errorResponse(parsed.format, "Global optimality was not proven.", 422);
      solverProof = shared.solver;
      built = { xi: shared.xi, bench: shared.bench, formation: shared.formation };
      range = { ok: true, weekly: shared.weekly, total: shared.total };
    } else {
      const ordinary = bestXI({ pool: poolFinal, xpOf: rangeXpts, budget: parsed.budget, maxPerClub: 3, startProbOf, minStart: 0.55 });
      const seed = ordinary ? [...ordinary.xi, ...ordinary.bench] : null;
      const fifteen = bestFifteenAllPlaying({
        pool: poolFinal,
        xpOf: rangeXpts,
        budget: parsed.budget,
        maxPerClub: 3,
        startProbOf,
        minStart: 0.55,
        seed,
      });
      if (!fifteen) return errorResponse(parsed.format, "No legal fifteen could be built under that budget.", 422);
      const shaped = optimiseSquad(
        { structure: "3-4-3", players: fifteen.players.map((player) => ({ ...player, starting: false })), captain: null, vice: null },
        rangeXpts,
        { xiBudget: Math.max(0, parsed.budget - minimumBenchSpend), benchBudget: minimumBenchSpend },
      );
      if (!shaped) return errorResponse(parsed.format, "The selected fifteen cannot field a legal budget-compliant XI.", 422);
      built = {
        xi: shaped.players.filter((player) => player.starting),
        bench: shaped.players.filter((player) => !player.starting),
        formation: shaped.structure,
      };
      const all = [...built.xi, ...built.bench];
      range = optimiseOwnedSquadRange({
        players: all,
        structure: built.formation,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        scoreForGw: (player, gameweek) => scorer.scoreForGw ? scorer.scoreForGw(player, gameweek) : 0,
        transferHitForGw: (gameweek) => parsed.transferHits[gameweek] || 0,
        xiBudget: Math.max(0, parsed.budget - minimumBenchSpend),
        benchBudget: minimumBenchSpend,
      });
      if (!range.ok) return errorResponse(parsed.format, range.error, 422);
    }

    const allPlayers = [...built.xi, ...built.bench];
    const firstWeek = range.weekly[0];
    const firstStarterIds = new Set(firstWeek.starters.map((player) => Number(player.fpl_id)));
    const squadPlayers = allPlayers.map((player) => serializePlayer(
      player,
      rangeXpts(player),
      firstStarterIds.has(Number(player.fpl_id)) ? "starter" : "bench",
    ));
    const xiCost = sumCost(allPlayers.filter((player) => firstStarterIds.has(Number(player.fpl_id))));
    const benchCost = sumCost(allPlayers.filter((player) => !firstStarterIds.has(Number(player.fpl_id))));
    const { blanks, doubles } = blanksAndDoubles(fixtures, teamRows.map((team) => team.id), parsed.gwFrom, parsed.gwTo);
    const fixtureFlags = [];
    for (let gw = parsed.gwFrom; gw <= parsed.gwTo; gw += 1) {
      fixtureFlags.push({
        gw,
        blanks: (blanks.get(gw) || []).map((id) => teamById[id]?.short_name).filter(Boolean),
        doubles: (doubles.get(gw) || []).map((id) => teamById[id]?.short_name).filter(Boolean),
      });
    }

    const payload = {
      ok: true,
      generated_at: new Date().toISOString(),
      source_mode: "external_xpts_lineup_gated",
      mode: parsed.mode,
      gw_from: parsed.gwFrom,
      gw_to: parsed.gwTo,
      supported_gameweeks: { from: OPTIMISE_GW_MIN, to: OPTIMISE_GW_MAX },
      lineup_gate: {
        active: Boolean(lineupGate?.active ?? scorer.lineupGate?.active),
        predicted_starters: Number(lineupGate?.startingIds?.size ?? scorer.lineupGate?.startingIds?.size ?? 0),
        ...(lineupGate?.report || scorer.lineupGate?.report || {}),
      },
      chip_schedule: parsed.chipSchedule,
      excluded_player_ids: excludedPlayerIds,
      only_player_ids: onlyPlayerIds,
      current_squad_ids: currentSquadIds.length ? currentSquadIds : null,
      maximum_changes: parsed.maximumChanges,
      squad_rules: parsed.squadRules && parsed.squadRules.length ? parsed.squadRules : null,
      only_player_resolution: onlyResolution ? (onlyResolution.resolution || null) : null,
      pool_size: poolFinal.length,
      excluded_player_resolution: exclusionResolution.resolution || null,
      exclusions_verified_absent_from_build: excludedPlayerIds.every(
        (id) => !allPlayers.some((player) => idOfPlayer(player) === id),
      ),
      squad: {
        players: squadPlayers,
        formation_for_first_gameweek: firstWeek.formation,
        xi_cost: Math.round(xiCost * 10) / 10,
        bench_cost: Math.round(benchCost * 10) / 10,
        total_cost: Math.round((xiCost + benchCost) * 10) / 10,
        composition: composition(allPlayers),
        club_counts: clubCounts(allPlayers),
      },
      weekly: range.weekly,
      total: range.total,
      fixture_flags: fixtureFlags,
      constraints: {
        total_budget: parsed.budget,
        xi_budget: Math.max(0, parsed.budget - minimumBenchSpend),
        bench_budget: minimumBenchSpend,
        bench_budget_rule: "minimum",
        maximum_goalkeeper_spend: parsed.maximumGoalkeeperSpend,
        goalkeeper_max_price: parsed.goalkeeperMaxPrice,
        minimum_goalkeepers_at_or_below_price: parsed.minimumGoalkeepersAtOrBelowPrice,
        minimum_price_by_position: parsed.minimumPriceByPosition,
        maximum_price_by_position: parsed.maximumPriceByPosition,
        maximum_spend_by_position: parsed.maximumSpendByPosition,
        max_per_club: 3,
        composition: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
      },
      solver: solverProof,
      errors: [],
    };

    if (parsed.format === "json") return json(payload);
    return new Response(plainText(payload), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(requestedFormat, `The optimiser could not run: ${error.message}`, 500);
  }
}
