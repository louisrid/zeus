import { PLAN_RULES, squadAt, transferLedger } from "../plan.mjs";
import { normaliseSquadChip, projectSquad } from "../squad-projection.mjs";
import { summariseSavedPlanRange } from "../plan-range.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const normal = (value) => String(value || "").trim().toLowerCase();

export function savedPlansOnly(plans = []) {
  return (Array.isArray(plans) ? plans : [])
    .filter((plan) => plan && plan.kind !== "live")
    .sort((a, b) => Number(Boolean(b.is_active)) - Number(Boolean(a.is_active))
      || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

export function selectSavedPlan(plans = [], selector = null, planId = null) {
  const list = savedPlansOnly(plans);
  if (planId !== null && planId !== undefined && planId !== "") {
    const exact = list.find((plan) => String(plan.id) === String(planId));
    if (exact) return exact;
  }

  const raw = String(selector || "").trim();
  if (!raw || normal(raw) === "active") return list.find((plan) => plan.is_active) || list[0] || null;
  if (/^\d+$/.test(raw)) {
    const index = Number(raw) - 1;
    if (index >= 0 && index < list.length) return list[index];
  }
  const exactName = list.find((plan) => normal(plan.name) === normal(raw));
  if (exactName) return exactName;
  const partial = list.filter((plan) => normal(plan.name).includes(normal(raw)));
  return partial.length === 1 ? partial[0] : null;
}

function hydratedState(plan, gw, players) {
  const state = squadAt(plan, gw);
  const byId = new Map((players || []).map((player) => [Number(player.fpl_id), player]));
  const configured = (plan.weeks?.[gw] || plan.weeks?.[String(gw)] || {}).startingIds;
  const configuredSet = Array.isArray(configured) ? new Set(configured.map(Number)) : null;
  const hydrated = state.players.map((stored) => {
    const live = byId.get(Number(stored.fpl_id));
    if (!live) return null;
    return {
      ...live,
      ...stored,
      starting: configuredSet ? configuredSet.has(Number(stored.fpl_id)) : Boolean(stored.starting),
    };
  }).filter(Boolean);
  return { ...state, players: hydrated };
}

export function summariseSavedPlan({
  plan, gw, players, scorer, simulateChip = null, includePlayers = true,
} = {}) {
  if (!plan) return null;
  const state = hydratedState(plan, gw, players);
  const ledger = transferLedger(plan, gw);
  const week = ledger[ledger.length - 1] || { free: 1, made: 0, paid: 0, hit: 0, unlimited: false };
  const scoreOf = (player) => scorer.scoreForGw(player, gw) ?? 0;
  const requestedTransferHit = Math.max(0, Number(week.made || 0) - Number(week.free || 0)) * PLAN_RULES.hitCost;
  const savedBreakdown = projectSquad({
    players: state.players,
    captain: state.captain,
    chip: state.chip,
    transferHit: requestedTransferHit,
    scoreOf,
  });
  const simulatedChip = normaliseSquadChip(simulateChip);
  const simulatedBreakdown = simulatedChip
    ? projectSquad({ players: state.players, captain: state.captain, chip: simulatedChip, transferHit: requestedTransferHit, scoreOf })
    : null;

  const playerRows = includePlayers ? state.players.map((player) => {
    const effective = finite(scorer.scoreForGw(player, gw)) ?? 0;
    const raw = scorer.rawScoreForGw ? (finite(scorer.rawScoreForGw(player, gw)) ?? effective) : effective;
    const startProbability = scorer.startProbForGw ? finite(scorer.startProbForGw(player, gw)) : null;
    const predicted = scorer.predictedStartOf ? scorer.predictedStartOf(player) : (startProbability === null ? null : startProbability === 1);
    return {
      fpl_id: Number(player.fpl_id),
      name: player.web_name || player.name || String(player.fpl_id),
      club: player.team || null,
      position: player.position || null,
      price: finite(player.price),
      ownership: finite(player.own),
      starting: Boolean(player.starting),
      bench: !player.starting,
      captain: Number(state.captain) === Number(player.fpl_id),
      vice_captain: Number(state.vice) === Number(player.fpl_id),
      predicted_start: predicted,
      start_probability: startProbability,
      raw_imported_xpts: raw,
      xpts: effective,
    };
  }) : undefined;

  const benchPlayers = state.players.filter((player) => !player.starting);
  const benchRanked = [
    ...benchPlayers.filter((p) => (p.position || "") === "GKP"),
    ...benchPlayers
      .filter((p) => (p.position || "") !== "GKP")
      .sort((a, b) => (finite(scorer.scoreForGw(b, gw)) ?? 0) - (finite(scorer.scoreForGw(a, gw)) ?? 0)),
  ];
  const benchSpend = Math.round(
    benchRanked.reduce((sum, player) => sum + (finite(player.price) ?? 0), 0) * 10,
  ) / 10;

  return {
    plan_id: plan.id,
    plan_name: plan.name || "Untitled plan",
    is_active: Boolean(plan.is_active),
    gw: Number(gw),
    structure: state.structure,
    chip: savedBreakdown.chip,
    transfers_made: week.made,
    free_transfers_available: week.free,
    paid_transfers: week.paid,
    transfer_hit: savedBreakdown.transferHit,
    requested_transfer_hit: savedBreakdown.requestedTransferHit,
    starting_xpts: savedBreakdown.startingXpts,
    captain_bonus: savedBreakdown.captainBonus,
    captain_multiplier: savedBreakdown.captainMultiplier,
    bench_boost_bonus: savedBreakdown.benchBoostBonus,
    wildcard_saving: savedBreakdown.wildcardSaving,
    gross_xpts: savedBreakdown.grossXpts,
    net_xpts: savedBreakdown.netXpts,
    bench_order: benchRanked.map((player) => Number(player.fpl_id)),
    bench_order_names: benchRanked.map((player) => player.web_name || player.name || String(player.fpl_id)),
    bench_order_policy: "backup_gkp_first_then_outfield_descending_xpts",
    bench_spend: benchSpend,
    player_count: state.players.length,
    problems: state.problems || [],
    players: playerRows,
    simulation: simulatedBreakdown ? {
      chip: simulatedChip,
      starting_xpts: simulatedBreakdown.startingXpts,
      captain_bonus: simulatedBreakdown.captainBonus,
      captain_multiplier: simulatedBreakdown.captainMultiplier,
      bench_boost_bonus: simulatedBreakdown.benchBoostBonus,
      wildcard_saving: simulatedBreakdown.wildcardSaving,
      transfer_hit: simulatedBreakdown.transferHit,
      gross_xpts: simulatedBreakdown.grossXpts,
      net_xpts: simulatedBreakdown.netXpts,
      difference: simulatedBreakdown.netXpts - savedBreakdown.netXpts,
      persisted: false,
    } : null,
  };
}

export function buildSavedSquadsPayload({
  plans = [], players = [], scorer, gw = 1, gwFrom = gw, gwTo = gw,
  selector = null, planId = null, simulateChip = null, simulateGw = null,
  includePlayers = true,
} = {}) {
  const saved = savedPlansOnly(plans);
  const selected = selectSavedPlan(saved, selector, planId);
  const available = saved.map((plan, index) => ({
    index: index + 1,
    plan_id: plan.id,
    plan_name: plan.name || "Untitled plan",
    is_active: Boolean(plan.is_active),
    player_count: Array.isArray(plan.base) ? plan.base.length : 0,
    updated_at: plan.updated_at || null,
  }));

  let range = null;
  let rangeError = null;
  if (selected) {
    try {
      range = summariseSavedPlanRange({
        plan: selected,
        players,
        scorer,
        gwFrom,
        gwTo,
        simulateChip,
        simulateGw,
        includePlayers,
      });
    } catch (error) {
      rangeError = error instanceof Error ? error.message : String(error);
    }
  }

  const selectedSingle = summariseSavedPlan({
    plan: selected,
    gw,
    players,
    scorer,
    simulateChip: simulateChip && Number(simulateGw ?? gw) === Number(gw) ? simulateChip : null,
    includePlayers,
  });

  return {
    saved_squad_count: saved.length,
    available_squads: available,
    selected_squad: selectedSingle ? {
      ...selectedSingle,
      gw_from: Number(gwFrom),
      gw_to: Number(gwTo),
      weekly: range?.weekly || [],
      range_total: range?.total || null,
      range_simulation: range?.simulation || null,
      range_error: rangeError,
    } : null,
  };
}
