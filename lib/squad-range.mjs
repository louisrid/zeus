import { optimiseSquad } from "./solver/optimise.mjs";
import { projectSquad, normaliseSquadChip } from "./squad-projection.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);

function playerRow(player, score) {
  return {
    fpl_id: idOf(player),
    web_name: player?.web_name ?? player?.name ?? String(idOf(player)),
    position: player?.position ?? null,
    team: player?.team ?? null,
    team_id: Number.isFinite(Number(player?.team_id)) ? Number(player.team_id) : null,
    price: finite(player?.price),
    xpts: finite(score),
  };
}

export function optimiseOwnedSquadRange({
  players = [],
  structure = "3-4-3",
  gwFrom = 1,
  gwTo = 1,
  scoreForGw = () => 0,
  chipForGw = () => null,
  transferHitForGw = () => 0,
  requiredStarterIdsForGw = () => [],
  onlyFormationForGw = () => null,
  xiBudget = null,
  benchBudget = null,
} = {}) {
  const first = Number(gwFrom);
  const last = Number(gwTo);
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
    return { ok: false, error: "Invalid gameweek range." };
  }
  const squadPlayers = Array.isArray(players) ? players.filter(Boolean) : [];
  if (squadPlayers.length !== 15) {
    return { ok: false, error: `A complete 15-player squad is required; received ${squadPlayers.length}.` };
  }

  const weekly = [];
  for (let gw = first; gw <= last; gw += 1) {
    const score = (player) => finite(scoreForGw(player, gw));
    const optimised = optimiseSquad(
      { structure, players: squadPlayers, captain: null, vice: null },
      score,
      {
        requiredStarterIds: requiredStarterIdsForGw(gw) || [],
        onlyFormation: onlyFormationForGw(gw) || null,
        xiBudget,
        benchBudget,
      },
    );
    if (!optimised) return { ok: false, error: `The owned 15 cannot field a legal XI in GW${gw}.` };

    const chip = normaliseSquadChip(chipForGw(gw));
    const projection = projectSquad({
      players: optimised.players,
      captain: optimised.captain,
      chip,
      transferHit: transferHitForGw(gw),
      scoreOf: score,
    });
    const starters = optimised.players.filter((player) => player.starting);
    const bench = optimised.players.filter((player) => !player.starting);
    weekly.push({
      gw,
      chip,
      formation: optimised.structure,
      starters: starters.map((player) => playerRow(player, score(player))),
      bench: bench.map((player) => playerRow(player, score(player))),
      captain: optimised.captain,
      vice_captain: optimised.vice,
      bench_order: optimised.benchOrder,
      starting_xpts: projection.startingXpts,
      captain_xpts: projection.captainXpts,
      captain_multiplier: projection.captainMultiplier,
      captain_bonus: projection.captainBonus,
      bench_boost_bonus: projection.benchBoostBonus,
      requested_transfer_hit: projection.requestedTransferHit,
      transfer_hit: projection.transferHit,
      wildcard_saving: projection.wildcardSaving,
      gross_xpts: projection.grossXpts,
      net_xpts: projection.netXpts,
    });
  }

  const sum = (key) => weekly.reduce((total, row) => total + finite(row[key]), 0);
  return {
    ok: true,
    gw_from: first,
    gw_to: last,
    weekly,
    total: {
      starting_xpts: sum("starting_xpts"),
      captain_bonus: sum("captain_bonus"),
      bench_boost_bonus: sum("bench_boost_bonus"),
      requested_transfer_hit: sum("requested_transfer_hit"),
      transfer_hit: sum("transfer_hit"),
      wildcard_saving: sum("wildcard_saving"),
      gross_xpts: sum("gross_xpts"),
      net_xpts: sum("net_xpts"),
    },
  };
}
