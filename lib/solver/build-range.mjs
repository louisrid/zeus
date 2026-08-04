import { bestXI } from "./autobuild.mjs";
import { optimiseOwnedSquadRange } from "../squad-range.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
const priceOf = (player) => finite(player?.price);
const sumPrice = (players) => players.reduce((sum, player) => sum + priceOf(player), 0);

function exactRange(gwFrom, gwTo) {
  const from = Number(gwFrom);
  const to = Number(gwTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 8 || to < from) {
    return null;
  }
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
  const secondary = finite(a.bench_xpts) - finite(b.bench_xpts);
  if (Math.abs(secondary) > 1e-9) return secondary;
  return finite(b.total_cost) - finite(a.total_cost);
}

export function buildSquadForRange({
  pool = [],
  scoreForGw = () => 0,
  gwFrom = 1,
  gwTo = gwFrom,
  chipForGw = () => null,
  transferHitForGw = () => 0,
  locks = [],
  ignores = [],
  keep = [],
  budget = 100,
  benchBudget = 17,
  maxPerClub = 3,
  startProbOf = null,
  minStart = 0.55,
  onlyFormation = null,
  maxSwapPasses = 14,
} = {}) {
  const range = exactRange(gwFrom, gwTo);
  if (!range) return { ok: false, error: "The Builder range must be an exact inclusive range within GW1-GW8." };
  const totalBudget = Number.isFinite(Number(budget)) ? Number(budget) : 100;
  const benchCap = Number.isFinite(Number(benchBudget)) ? Number(benchBudget) : 17;
  const xiCap = totalBudget - benchCap;
  const lockSet = new Set((locks || []).map(Number));
  const keepSet = new Set((keep || []).map(Number));
  const ignoreSet = new Set((ignores || []).map(Number));
  const playerScore = (player) => {
    let total = 0;
    for (let gw = range.from; gw <= range.to; gw += 1) total += finite(scoreForGw(player, gw));
    return total;
  };
  const seed = bestXI({
    pool,
    xpOf: playerScore,
    locks: [...lockSet],
    ignores: [...ignoreSet],
    keep: [...keepSet],
    budget: totalBudget,
    benchBudget: benchCap,
    maxPerClub,
    startProbOf,
    minStart,
    onlyFormation,
  });
  if (!seed) return { ok: false, error: "No legal squad fits the selected range, locks, keeps, ignores and budgets." };

  let players = [...seed.xi, ...seed.bench];
  let anchorStarterIds = new Set(seed.xi.map(idOf));
  const required = [...lockSet];
  const evaluate = (candidatePlayers, candidateAnchorIds) => {
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
      benchBudget: benchCap,
    });
    if (!rangeResult.ok) return null;
    const benchXpts = rangeResult.weekly.reduce((sum, week) =>
      sum + (week.bench || []).reduce((weekSum, player) => weekSum + finite(player.xpts), 0), 0);
    const anchorXi = candidatePlayers.filter((player) => candidateAnchorIds.has(idOf(player)));
    const anchorBench = candidatePlayers.filter((player) => !candidateAnchorIds.has(idOf(player)));
    return {
      range: rangeResult,
      bench_xpts: benchXpts,
      xi_cost: sumPrice(anchorXi),
      bench_cost: sumPrice(anchorBench),
      total_cost: sumPrice(candidatePlayers),
    };
  };

  let best = evaluate(players, anchorStarterIds);
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
    const merged = [...ranked.slice(0, 36), ...cheap.slice(0, 12)];
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
      const outgoingWasAnchorStarter = anchorStarterIds.has(outgoingId);
      for (const incoming of candidateByPosition[outgoing.position] || []) {
        const incomingId = idOf(incoming);
        if (owned.has(incomingId)) continue;
        if (outgoingWasAnchorStarter && startProbOf) {
          const probability = startProbOf(incoming);
          if (probability !== null && probability !== undefined && Number(probability) < minStart) continue;
        }
        const incomingClubCount = (clubs.get(Number(incoming.team_id)) || 0)
          - (Number(incoming.team_id) === Number(outgoing.team_id) ? 1 : 0) + 1;
        if (incomingClubCount > maxPerClub) continue;
        const nextPlayers = players.map((player, playerIndex) => playerIndex === index
          ? { ...incoming, starting: Boolean(outgoing.starting) }
          : player);
        const nextAnchorIds = new Set(anchorStarterIds);
        if (outgoingWasAnchorStarter) {
          nextAnchorIds.delete(outgoingId);
          nextAnchorIds.add(incomingId);
        }
        const anchorXi = nextPlayers.filter((player) => nextAnchorIds.has(idOf(player)));
        const anchorBench = nextPlayers.filter((player) => !nextAnchorIds.has(idOf(player)));
        if (sumPrice(anchorXi) > xiCap + 1e-9 || sumPrice(anchorBench) > benchCap + 1e-9
          || sumPrice(nextPlayers) > totalBudget + 1e-9) continue;
        const evaluated = evaluate(nextPlayers, nextAnchorIds);
        if (!evaluated || compareEvaluation(evaluated, best) <= 1e-9) continue;
        if (!bestSwap || compareEvaluation(evaluated, bestSwap.evaluated) > 1e-9) {
          bestSwap = { nextPlayers, nextAnchorIds, evaluated };
        }
      }
    }
    if (!bestSwap) break;
    players = bestSwap.nextPlayers;
    anchorStarterIds = bestSwap.nextAnchorIds;
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
    benchBudget: benchCap,
    search: "shared bestXI seed plus exact-objective legal swap improvement",
  };
}
