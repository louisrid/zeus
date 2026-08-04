import { PLAN_RULES, squadAt, transferLedger } from "./plan.mjs";
import { optimiseSquad } from "./solver/optimise.mjs";
import { normaliseSquadChip, projectSquad } from "./squad-projection.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const numberOrNull = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const playerId = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);

function exactRange(gwFrom, gwTo) {
  const from = Number(gwFrom);
  const to = Number(gwTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 8 || to < from) {
    throw new Error("The saved-squad range must be an exact inclusive range within GW1-GW8.");
  }
  return { from, to };
}

export function hydratePlanState(plan, gw, players = []) {
  const raw = squadAt(plan, gw);
  const byId = new Map(players.map((player) => [playerId(player), player]));
  const configured = plan?.weeks?.[gw]?.startingIds ?? plan?.weeks?.[String(gw)]?.startingIds;
  const configuredSet = Array.isArray(configured) ? new Set(configured.map(Number)) : null;
  const hydrated = raw.players.map((stored) => {
    const live = byId.get(Number(stored.fpl_id));
    if (!live) return null;
    return {
      ...live,
      ...stored,
      starting: configuredSet ? configuredSet.has(Number(stored.fpl_id)) : Boolean(stored.starting),
    };
  }).filter(Boolean);
  return { ...raw, players: hydrated };
}

function transferWeek(plan, gw) {
  const rows = transferLedger(plan, gw);
  return rows[rows.length - 1] || {
    gw, made: 0, free: PLAN_RULES.freePerGw, paid: 0, hit: 0, chip: null, unlimited: false,
  };
}

function roleRows(state, scorer, gw, scoreOf, includePlayers) {
  if (!includePlayers) return undefined;
  const benchOrder = new Map((state.benchOrder || []).map((id, index) => [Number(id), index + 1]));
  return state.players.map((player) => {
    const effective = finite(scoreOf(player));
    const raw = scorer?.rawScoreForGw
      ? (numberOrNull(scorer.rawScoreForGw(player, gw)) ?? effective)
      : effective;
    const startProbability = scorer?.startProbForGw
      ? numberOrNull(scorer.startProbForGw(player, gw))
      : null;
    const predicted = scorer?.predictedStartOf
      ? scorer.predictedStartOf(player)
      : (startProbability === null ? null : startProbability === 1);
    return {
      fpl_id: playerId(player),
      name: player.web_name || player.name || String(playerId(player)),
      club: player.team || null,
      position: player.position || null,
      price: Number.isFinite(Number(player.price)) ? Number(player.price) : null,
      ownership: Number.isFinite(Number(player.own)) ? Number(player.own) : null,
      starting: Boolean(player.starting),
      bench: !player.starting,
      bench_order: benchOrder.get(playerId(player)) ?? null,
      captain: Number(state.captain) === playerId(player),
      vice_captain: Number(state.vice) === playerId(player),
      predicted_start: predicted,
      start_probability: startProbability,
      raw_imported_xpts: raw,
      xpts: effective,
    };
  });
}

function projectedWeek({ plan, state, scorer, gw, chip = state.chip, includePlayers = false }) {
  if (state.players.length !== PLAN_RULES.squadSize) {
    throw new Error(`GW${gw} contains ${state.players.length} players; a complete 15-player squad is required.`);
  }
  const ledger = transferWeek(plan, gw);
  const scoreOf = (player) => finite(scorer.scoreForGw(player, gw));
  const theoreticalHit = Math.max(0, Number(ledger.made || 0) - Number(ledger.free || 0)) * PLAN_RULES.hitCost;
  const requestedTransferHit = ledger.unlimited && state.chip !== "wildcard" ? 0 : theoreticalHit;
  const projection = projectSquad({
    players: state.players,
    captain: state.captain,
    chip,
    transferHit: requestedTransferHit,
    scoreOf,
  });
  return {
    gw,
    structure: state.structure,
    chip: projection.chip,
    transfers_made: ledger.made,
    free_transfers_available: ledger.free,
    paid_transfers: ledger.paid,
    requested_transfer_hit: projection.requestedTransferHit,
    transfer_hit: projection.transferHit,
    starting_xpts: projection.startingXpts,
    captain_bonus: projection.captainBonus,
    captain_multiplier: projection.captainMultiplier,
    bench_boost_bonus: projection.benchBoostBonus,
    wildcard_saving: projection.wildcardSaving,
    gross_xpts: projection.grossXpts,
    net_xpts: projection.netXpts,
    captain: state.captain,
    vice_captain: state.vice,
    bench_order: state.benchOrder || [],
    players: roleRows(state, scorer, gw, scoreOf, includePlayers),
  };
}

function totalOf(weekly) {
  const sum = (key) => weekly.reduce((total, week) => total + finite(week[key]), 0);
  return {
    starting_xpts: sum("starting_xpts"),
    captain_bonus: sum("captain_bonus"),
    bench_boost_bonus: sum("bench_boost_bonus"),
    requested_transfer_hit: sum("requested_transfer_hit"),
    transfer_hit: sum("transfer_hit"),
    wildcard_saving: sum("wildcard_saving"),
    gross_xpts: sum("gross_xpts"),
    net_xpts: sum("net_xpts"),
  };
}

export function summariseSavedPlanRange({
  plan,
  players = [],
  scorer,
  gwFrom = 1,
  gwTo = gwFrom,
  simulateChip = null,
  simulateGw = null,
  includePlayers = false,
} = {}) {
  if (!plan) return null;
  const { from, to } = exactRange(gwFrom, gwTo);
  const requestedSimulationChip = normaliseSquadChip(simulateChip);
  const requestedSimulationGw = requestedSimulationChip
    ? Number(simulateGw ?? from)
    : null;
  if (requestedSimulationChip && (!Number.isInteger(requestedSimulationGw)
    || requestedSimulationGw < from || requestedSimulationGw > to)) {
    throw new Error("simulate_gw must be inside the requested saved-squad range.");
  }

  const weekly = [];
  let simulation = null;
  for (let gw = from; gw <= to; gw += 1) {
    const state = hydratePlanState(plan, gw, players);
    const baseline = projectedWeek({ plan, state, scorer, gw, includePlayers });
    weekly.push(baseline);
    if (requestedSimulationChip && gw === requestedSimulationGw) {
      const simulated = projectedWeek({
        plan,
        state,
        scorer,
        gw,
        chip: requestedSimulationChip,
        includePlayers,
      });
      simulation = {
        gw,
        chip: requestedSimulationChip,
        saved_chip: baseline.chip,
        baseline_net_xpts: baseline.net_xpts,
        simulated_net_xpts: simulated.net_xpts,
        difference: simulated.net_xpts - baseline.net_xpts,
        projected: simulated,
        persisted: false,
      };
    }
  }

  const total = totalOf(weekly);
  return {
    gw_from: from,
    gw_to: to,
    weekly,
    total,
    simulation: simulation ? {
      ...simulation,
      range_baseline_net_xpts: total.net_xpts,
      range_simulated_net_xpts: total.net_xpts + simulation.difference,
    } : null,
  };
}

export function optimiseSavedPlanRange({
  plan,
  players = [],
  scorer,
  gwFrom = 1,
  gwTo = gwFrom,
} = {}) {
  if (!plan) return { ok: false, error: "A saved plan is required." };
  let range;
  try { range = exactRange(gwFrom, gwTo); }
  catch (error) { return { ok: false, error: error.message }; }

  const weekly = [];
  for (let gw = range.from; gw <= range.to; gw += 1) {
    const state = hydratePlanState(plan, gw, players);
    if (state.players.length !== PLAN_RULES.squadSize) {
      return { ok: false, error: `GW${gw} contains ${state.players.length} players; a complete 15-player squad is required.` };
    }
    const scoreOf = (player) => finite(scorer.scoreForGw(player, gw));
    const optimised = optimiseSquad({
      structure: state.structure,
      players: state.players,
      captain: state.captain,
      vice: state.vice,
    }, scoreOf);
    if (!optimised) return { ok: false, error: `The owned 15 cannot field a legal XI in GW${gw}.` };

    const projection = projectedWeek({
      plan,
      state: {
        ...state,
        structure: optimised.structure,
        players: optimised.players,
        captain: optimised.captain,
        vice: optimised.vice,
        benchOrder: optimised.benchOrder,
      },
      scorer,
      gw,
      includePlayers: true,
    });
    weekly.push({
      ...projection,
      starting_ids: optimised.players.filter((player) => player.starting).map(playerId),
      bench_order: optimised.benchOrder || [],
      captain: optimised.captain,
      vice_captain: optimised.vice,
    });
  }

  return {
    ok: true,
    gw_from: range.from,
    gw_to: range.to,
    weekly,
    total: totalOf(weekly),
  };
}

export function applyOptimisedRangeToPlan(plan, result) {
  if (!result?.ok || !Array.isArray(result.weekly)) throw new Error("A successful range result is required.");
  const next = JSON.parse(JSON.stringify(plan));
  next.weeks = { ...(next.weeks || {}) };
  for (const week of result.weekly) {
    next.weeks[week.gw] = {
      ...(next.weeks[week.gw] || {}),
      structure: week.structure,
      startingIds: [...week.starting_ids],
      benchOrder: [...(week.bench_order || [])],
      captain: week.captain,
      vice: week.vice_captain,
    };
  }
  return next;
}
