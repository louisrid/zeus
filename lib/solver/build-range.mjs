import { bestXI } from "./autobuild.mjs";
import { bestFifteenAllPlaying } from "./optimise.mjs";
import { optimiseOwnedSquadRange } from "../squad-range.mjs";
import { EXTERNAL_XPTS_GW_TO } from "../external_xpts.mjs";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
const priceOf = (player) => finite(player?.price);
const sumPrice = (players) => players.reduce((sum, player) => sum + priceOf(player), 0);

function exactRange(gwFrom, gwTo) {
  const from = Number(gwFrom);
  const to = Number(gwTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > EXTERNAL_XPTS_GW_TO || to < from) return null;
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

function uniqueSeeds(seeds) {
  const found = new Map();
  for (const seed of seeds.filter(Boolean)) {
    const players = Array.isArray(seed.players) ? seed.players : [];
    if (players.length !== 15) continue;
    const key = players.map(idOf).sort((a, b) => a - b).join(",");
    if (!found.has(key)) found.set(key, seed);
  }
  return [...found.values()];
}

export function buildSquadForRange({
  pool = [], scoreForGw = () => 0, gwFrom = 1, gwTo = gwFrom,
  chipForGw = () => null, transferHitForGw = () => 0,
  locks = [], ignores = [], keep = [], budget = 100, benchBudget = 17,
  maxPerClub = 3, startProbOf = null, minStart = 0.55,
  onlyFormation = null, maxSwapPasses = 12,
} = {}) {
  const range = exactRange(gwFrom, gwTo);
  if (!range) {
    return { ok: false,
      error: `The Builder range must be an exact inclusive range within GW1-GW${EXTERNAL_XPTS_GW_TO}. Got GW${gwFrom} to GW${gwTo}.` };
  }
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
    if (String(chipForGw(gw) || "").toLowerCase().replace(/[\s_-]+/g, "") === "benchboost") {
      benchBoostWeeks.push(gw);
    }
  }
  const hasBenchBoost = benchBoostWeeks.length > 0;
  const chipWeightedScore = (player) => playerScore(player)
    + benchBoostWeeks.reduce((sum, gw) => sum + finite(scoreForGw(player, gw)), 0);

  const rawSeeds = [];
  const seedBenchMinimums = hasBenchBoost ? [17, 19, 21, 23, 26, 30] : [benchMinimum];
  for (const seedBenchMinimum of seedBenchMinimums) {
    for (const xpOf of (hasBenchBoost ? [playerScore, chipWeightedScore] : [playerScore])) {
      const built = bestXI({
        pool,
        xpOf,
        locks: [...lockSet],
        ignores: [...ignoreSet],
        keep: [...keepSet],
        budget: totalBudget,
        benchBudget: seedBenchMinimum,
        maxPerClub,
        startProbOf,
        minStart,
        onlyFormation,
      });
      if (built) rawSeeds.push({ players: [...built.xi, ...built.bench], formation: built.formation });
    }
  }

  // Bench Boost needs complete-squad seeds as well as XI-first seeds. These are legal only when
  // there are no explicit ownership constraints to preserve.
  if (hasBenchBoost && lockSet.size === 0 && keepSet.size === 0) {
    const allowedPool = (pool || []).filter((player) => !ignoreSet.has(idOf(player)));
    const allPlayingScores = [
      chipWeightedScore,
      playerScore,
      ...benchBoostWeeks.map((gw) => (player) => finite(scoreForGw(player, gw))),
    ];
    for (const xpOf of allPlayingScores) {
      const allPlaying = bestFifteenAllPlaying({
        pool: allowedPool,
        xpOf,
        budget: totalBudget,
        maxPerClub,
        startProbOf,
        minStart,
      });
      if (allPlaying) rawSeeds.push({ players: allPlaying.players, formation: onlyFormation || "3-4-3" });
    }
  }

  const seeds = uniqueSeeds(rawSeeds);
  if (!seeds.length) return { ok: false, error: "No legal squad fits the selected range, locks, keeps, ignores and total budget." };

  const required = [...lockSet];
  const evaluate = (candidatePlayers, structure) => {
    if (sumPrice(candidatePlayers) > totalBudget + 1e-9) return null;
    const rangeResult = optimiseOwnedSquadRange({
      players: candidatePlayers,
      structure,
      gwFrom: range.from,
      gwTo: range.to,
      scoreForGw,
      chipForGw,
      transferHitForGw,
      requiredStarterIdsForGw: () => required,
      onlyFormationForGw: () => onlyFormation,
      // For Bench Boost, 17m is only the minimum bench spend. Do not seed or evaluate through
      // a fixed 83m/17m allocation. A legal 100m squad with bench >=17m automatically has XI <=83m.
      xiBudget: hasBenchBoost ? null : xiCap,
      benchBudget: benchMinimum,
    });
    if (!rangeResult.ok) return null;
    return { range: rangeResult, total_cost: sumPrice(candidatePlayers) };
  };

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
      .slice(0, 28));
    const merged = [...ranked.slice(0, 52), ...chipRanked, ...cheap.slice(0, 18)];
    candidateByPosition[position] = [...new Map(merged.map((player) => [idOf(player), player])).values()];
  }

  const improve = (seed) => {
    let players = [...seed.players];
    let best = evaluate(players, seed.formation);
    if (!best) return null;

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
          const evaluated = evaluate(nextPlayers, seed.formation);
          if (!evaluated || compareEvaluation(evaluated, best) <= 1e-9) continue;
          if (!bestSwap || compareEvaluation(evaluated, bestSwap.evaluated) > 1e-9) {
            bestSwap = { nextPlayers, evaluated };
          }
        }
      }
      if (!bestSwap) break;
      players = bestSwap.nextPlayers;
      best = bestSwap.evaluated;
    }
    return { players, best };
  };

  const rankedSeeds = seeds
    .map((seed) => ({ seed, evaluated: evaluate(seed.players, seed.formation) }))
    .filter((row) => row.evaluated)
    .sort((a, b) => compareEvaluation(b.evaluated, a.evaluated));
  const startsToSearch = hasBenchBoost ? rankedSeeds.slice(0, 4) : rankedSeeds.slice(0, 1);

  let winningRun = null;
  for (const row of startsToSearch) {
    const run = improve(row.seed);
    if (run && (!winningRun || compareEvaluation(run.best, winningRun.best) > 1e-9)) winningRun = run;
  }
  if (!winningRun) return { ok: false, error: "The selected 15 cannot field a legal budget-compliant XI across the requested range." };

  const players = winningRun.players;
  const best = winningRun.best;
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
    search: hasBenchBoost
      ? "multi-start full-squad Bench Boost search with a 17m bench minimum and no fixed split"
      : "shared bestXI seed plus exact-objective legal 15-player swap improvement",
  };
}
