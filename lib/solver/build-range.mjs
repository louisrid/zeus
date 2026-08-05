import { bestXI } from "./autobuild.mjs";
import { optimiseOwnedSquadRange } from "../squad-range.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
const priceOf = (player) => finite(player?.price);
const sumPrice = (players) => players.reduce((sum, player) => sum + priceOf(player), 0);

function exactRange(gwFrom, gwTo) {
  const from = Number(gwFrom);
  const to = Number(gwTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 8 || to < from) return null;
  return { from, to };
}

function clubCounts(players) {
  const counts = new Map();
  for (const player of players) counts.set(Number(player.team_id), (counts.get(Number(player.team_id)) || 0) + 1);
  return counts;
}

function compareEvaluation(a, b) {
  if (!b) return 1;
  const primary = finite(a.range.total.net_xpts) - finite(b.range.total.net_xpts);
  if (Math.abs(primary) > 1e-9) return primary;
  const secondary = finite(a.range.total.bench_boost_bonus) - finite(b.range.total.bench_boost_bonus);
  if (Math.abs(secondary) > 1e-9) return secondary;
  return finite(b.total_cost) - finite(a.total_cost);
}

export function buildSquadForRange({
  pool = [], scoreForGw = () => 0, gwFrom = 1, gwTo = gwFrom,
  chipForGw = () => null, transferHitForGw = () => 0,
  locks = [], ignores = [], keep = [], budget = 100, benchBudget = 17,
  maxPerClub = 3, startProbOf = null, minStart = 0.55,
  onlyFormation = null, maxSwapPasses = 14,
} = {}) {
  const range = exactRange(gwFrom, gwTo);
  if (!range) return { ok: false, error: "The Builder range must be an exact inclusive range within GW1-GW8." };
  const totalBudget = Number.isFinite(Number(budget)) ? Number(budget) : 100;
  const benchMinimum = Number.isFinite(Number(benchBudget)) ? Number(benchBudget) : 17;
  const xiCap = totalBudget - benchMinimum;
  const lockSet = new Set((locks || []).map(Number));
  const keepSet = new Set((keep || []).map(Number));
  const ignoreSet = new Set((ignores || []).map(Number));
  const playerScore = (player) => {
    let total = 0;
    for (let gw = range.from; gw <= range.to; gw += 1) total += finite(scoreForGw(player, gw));
    return total;
  };
  const benchBoostWeeks = [];
  for (let gw = range.from; gw <= range.to; gw += 1) {
    if (String(chipForGw(gw) || "").toLowerCase().replace(/[\s_-]+/g, "") === "benchboost") benchBoostWeeks.push(gw);
  }

  const seed = bestXI({
    pool, xpOf: playerScore, locks: [...lockSet], ignores: [...ignoreSet], keep: [...keepSet],
    budget: totalBudget, benchBudget: benchMinimum, maxPerClub, startProbOf, minStart, onlyFormation,
  });
  if (!seed) return { ok: false, error: "No legal squad fits the selected range, locks, keeps, ignores and budgets." };

  let players = [...seed.xi, ...seed.bench];
  const required = [...lockSet];
  const evaluate = (candidatePlayers) => {
    if (sumPrice(candidatePlayers) > totalBudget + 1e-9) return null;
    const rangeResult = optimiseOwnedSquadRange({
      players: candidatePlayers,
      structure: seed.formation,
      gwFrom: range.from,
      gwTo: range.to,
      scoreForGw,
      chipForGw,
      transferHitForGw,
      requiredStarterIdsForGw: () => required,
      onlyFormationForGw: () => onlyFormation,
      xiBudget: xiCap,
      benchBudget: benchMinimum,
    });
    if (!rangeResult.ok) return null;
    return { range: rangeResult, total_cost: sumPrice(candidatePlayers) };
  };

  let best = evaluate(players);
  if (!best) return { ok: false, error: "The selected 15 cannot field a legal budget-compliant XI across the requested range." };

  const eligible = (pool || []).filter((player) => {
    const id = idOf(player);
    return Number.isFinite(id) && priceOf(player) > 0 && !ignoreSet.has(id);
  });
  const candidateByPosition = {};
  for (const position of ["GKP", "DEF", "MID", "FWD"]) {
    const atPosition = eligible.filter((player) => player.position === position);
    const ranked = [...atPosition].sort((a, b) => playerScore(b) - playerScore(a) || priceOf(a) - priceOf(b));
    const cheap = [...atPosition].sort((a, b) => priceOf(a) - priceOf(b) || playerScore(b) - playerScore(a));
    const chipRanked = benchBoostWeeks.flatMap((gw) => [...atPosition]
      .sort((a, b) => finite(scoreForGw(b, gw)) - finite(scoreForGw(a, gw))
        || playerScore(b) - playerScore(a) || priceOf(a) - priceOf(b))
      .slice(0, 24));
    const merged = [...ranked.slice(0, 48), ...chipRanked, ...cheap.slice(0, 16)];
    candidateByPosition[position] = [...new Map(merged.map((player) => [idOf(player), player])).values()];
  }

  for (let pass = 0; pass < maxSwapPasses; pass += 1) {
    const owned = new Set(players.map(idOf));
    const clubs = clubCounts(players);
    let bestSwap = null;
    for (let index = 0; index < players.length; index += 1) {
      const outgoing = players[index];
      const outgoingId = idOf(outgoing);
      if (lockSet.has(outgoingId) || keepSet.has(outgoingId)) continue;
      for (const incoming of candidateByPosition[outgoing.position] || []) {
        const incomingId = idOf(incoming);
        if (owned.has(incomingId)) continue;
        const incomingClubCount = (clubs.get(Number(incoming.team_id)) || 0)
          - (Number(incoming.team_id) === Number(outgoing.team_id) ? 1 : 0) + 1;
        if (incomingClubCount > maxPerClub) continue;
        const nextPlayers = players.map((player, playerIndex) => playerIndex === index
          ? { ...incoming, starting: Boolean(outgoing.starting) }
          : player);
        if (sumPrice(nextPlayers) > totalBudget + 1e-9) continue;
        const evaluated = evaluate(nextPlayers);
        if (!evaluated || compareEvaluation(evaluated, best) <= 1e-9) continue;
        if (!bestSwap || compareEvaluation(evaluated, bestSwap.evaluated) > 1e-9) bestSwap = { nextPlayers, evaluated };
      }
    }
    if (!bestSwap) break;
    players = bestSwap.nextPlayers;
    best = bestSwap.evaluated;
  }

  const firstWeek = best.range.weekly[0];
  const firstStarterIds = new Set((firstWeek.starters || []).map((player) => Number(player.fpl_id)));
  const byId = new Map(players.map((player) => [idOf(player), player]));
  const xi = (firstWeek.starters || []).map((row) => ({ ...byId.get(Number(row.fpl_id)), starting: true }));
  const bench = (firstWeek.bench || []).map((row) => ({ ...byId.get(Number(row.fpl_id)), starting: false }));
  return {
    ok: true,
    xi,
    bench,
    formation: firstWeek.formation,
    captain: firstWeek.captain,
    vice: firstWeek.vice_captain,
    weekly: best.range.weekly,
    total: best.range.total,
    xp: Math.round(finite(best.range.total.net_xpts) * 10) / 10,
    cost: Math.round(best.total_cost * 10) / 10,
    xiCost: Math.round(sumPrice(players.filter((player) => firstStarterIds.has(idOf(player)))) * 10) / 10,
    benchCost: Math.round(sumPrice(players.filter((player) => !firstStarterIds.has(idOf(player)))) * 10) / 10,
    benchBudget: benchMinimum,
    search: "shared bestXI seed plus unrestricted exact-objective legal 15-player swap improvement",
  };
}
