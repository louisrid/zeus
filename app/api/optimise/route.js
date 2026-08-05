/* Read-only theoretical squad optimiser.
 *
 * Exact gw_from/gw_to requests are supported across the canonical external-xPTS horizon, GW1-GW8.
 * The existing weeks=N behaviour remains available for callers that intentionally begin at the current
 * ZEUS gameweek. JSON is the stable tool contract; plain text remains available for existing human use.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import { blanksAndDoubles } from "../../../lib/server/fixtures.mjs";
import { bestXI } from "../../../lib/solver/autobuild.mjs";
import { bestFifteenAllPlaying, optimiseSquad } from "../../../lib/solver/optimise.mjs";
import { buildSquadForRange } from "../../../lib/solver/build-range.mjs";
import { parseOptimiseRequest, OPTIMISE_GW_MIN, OPTIMISE_GW_MAX } from "../../../lib/optimise-request.mjs";
import { optimiseOwnedSquadRange } from "../../../lib/squad-range.mjs";

export const dynamic = "force-dynamic";

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
    const pool = players.filter((player) => (!player.status || player.status === "a") && Number(player.price) > 0);

    let built;
    let range;
    if (parsed.mode === "squad" || parsed.mode === "benchboost") {
      const shared = buildSquadForRange({
        pool,
        scoreForGw: (player, gameweek) => scorer.scoreForGw ? scorer.scoreForGw(player, gameweek) : 0,
        gwFrom: parsed.gwFrom,
        gwTo: parsed.gwTo,
        chipForGw: (gameweek) => parsed.chipSchedule[gameweek] || null,
        transferHitForGw: (gameweek) => parsed.transferHits[gameweek] || 0,
        budget: parsed.budget,
        benchBudget: 17,
        maxPerClub: 3,
        startProbOf,
        minStart: 0.55,
      });
      if (!shared.ok) return errorResponse(parsed.format, shared.error, 422);
      built = { xi: shared.xi, bench: shared.bench, formation: shared.formation };
      range = { ok: true, weekly: shared.weekly, total: shared.total };
    } else {
      const ordinary = bestXI({ pool, xpOf: rangeXpts, budget: parsed.budget, maxPerClub: 3, startProbOf, minStart: 0.55 });
      const seed = ordinary ? [...ordinary.xi, ...ordinary.bench] : null;
      const fifteen = bestFifteenAllPlaying({
        pool,
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
        { xiBudget: Math.max(0, parsed.budget - 17), benchBudget: 17 },
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
        xiBudget: Math.max(0, parsed.budget - 17),
        benchBudget: 17,
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

    const flexibleBenchBoostBudget = (parsed.mode === "squad" || parsed.mode === "benchboost")
      && Object.values(parsed.chipSchedule).includes("benchboost");
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
        xi_budget: flexibleBenchBoostBudget ? null : Math.max(0, parsed.budget - 17),
        bench_budget: flexibleBenchBoostBudget ? null : 17,
        max_per_club: 3,
        composition: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
      },
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
