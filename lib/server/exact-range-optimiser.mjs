import createHighsPackage from "highs";
import { normaliseSquadChip, projectSquad } from "../squad-projection.mjs";

const POSITIONS = ["GKP", "DEF", "MID", "FWD"];
const COMPOSITION = Object.freeze({ GKP: 2, DEF: 5, MID: 5, FWD: 3 });
const FORMATIONS = Object.freeze({
  "3-4-3": { GKP: 1, DEF: 3, MID: 4, FWD: 3 },
  "3-5-2": { GKP: 1, DEF: 3, MID: 5, FWD: 2 },
  "4-3-3": { GKP: 1, DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { GKP: 1, DEF: 4, MID: 4, FWD: 2 },
  "4-5-1": { GKP: 1, DEF: 4, MID: 5, FWD: 1 },
  "5-2-3": { GKP: 1, DEF: 5, MID: 2, FWD: 3 },
  "5-3-2": { GKP: 1, DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { GKP: 1, DEF: 5, MID: 4, FWD: 1 },
});
const PRICE_SCALE = 10;
const SCORE_SCALE = 1_000_000;
const BINARY_TOLERANCE = 1e-6;
const ENGINE_VERSION = "1.14.2";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
const priceOf = (player) => finite(player?.price);
const priceUnits = (player) => Math.round(priceOf(player) * PRICE_SCALE);
const scoreUnits = (value) => Math.round(finite(value) * SCORE_SCALE);
const rounded = (value) => Math.round(finite(value) * 10) / 10;

let highsPromise = null;
async function getHighs() {
  if (!highsPromise) {
    const factory = createHighsPackage?.default ?? createHighsPackage;
    highsPromise = factory();
  }
  return highsPromise;
}

function exactRange(gwFrom, gwTo) {
  const from = Number(gwFrom);
  const to = Number(gwTo);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 8 || to < from) return null;
  return { from, to };
}

function safeStartProbability(startProbOf, player) {
  if (!startProbOf) return null;
  try {
    const value = startProbOf(player);
    if (value === null || value === undefined || value === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  } catch {
    return null;
  }
}

function playerRow(player, score) {
  return {
    fpl_id: idOf(player),
    web_name: player?.web_name ?? player?.name ?? String(idOf(player)),
    position: player?.position ?? null,
    team: player?.team ?? null,
    team_id: Number(player?.team_id),
    price: priceOf(player),
    xpts: finite(score),
  };
}

function term(coefficient, variable) {
  const n = Number(coefficient);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-12) return null;
  return [n, variable];
}

function linearExpression(rawTerms) {
  const terms = rawTerms.filter(Boolean);
  if (!terms.length) return "0";
  return terms.map(([coefficient, variable], index) => {
    const sign = coefficient < 0 ? "-" : "+";
    const magnitude = Math.abs(coefficient);
    const body = `${magnitude} ${variable}`;
    if (index === 0) return coefficient < 0 ? `- ${body}` : body;
    return `${sign} ${body}`;
  }).join(" ");
}

function constraint(name, terms, operator, rhs) {
  return ` ${name}: ${linearExpression(terms)} ${operator} ${rhs}`;
}

function primal(solution, variableName) {
  const columns = solution?.Columns;
  const row = Array.isArray(columns)
    ? columns.find((column) => column?.Name === variableName)
    : columns?.[variableName];
  return finite(row?.Primal);
}

function selected(solution, variableName) {
  return primal(solution, variableName) > 0.5;
}

function assertIntegral(solution, variableNames) {
  for (const variableName of variableNames) {
    const value = primal(solution, variableName);
    if (Math.min(Math.abs(value), Math.abs(value - 1)) > BINARY_TOLERANCE) {
      throw new Error(`HiGHS returned fractional binary ${variableName}=${value}.`);
    }
  }
}

function formationFrom(starters) {
  const count = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of starters) count[player.position] += 1;
  return `${count.DEF}-${count.MID}-${count.FWD}`;
}

function combinations(items, size) {
  const result = [];
  const current = [];
  const walk = (start) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    if (items.length - start < size - current.length) return;
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

function firstKeyIsBetter(candidate, incumbent) {
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] < incumbent[index]) return true;
    if (candidate[index] > incumbent[index]) return false;
  }
  return false;
}

// In a Bench Boost week every one of the 15 players scores, so the XI/bench split
// contributes nothing to the objective and HiGHS is free to return any legal split.
// This picks the split a normal week would produce: maximise XI xPTS, subject to the
// same formation, XI-budget and minimum-bench-spend rules, keeping the captain in the XI.
// The squad, the captain and therefore the week total are all unchanged.
function bestBenchBoostSplit({ squad, captain, scoreForGw, gw, xiMaximum, benchMinimum,
  onlyFormation, requiredStarterIds = null, requiredBenchIds = null }) {
  const captainId = idOf(captain);
  let best = null;
  for (const benchCandidate of combinations(squad, 4)) {
    if (benchCandidate.some((player) => idOf(player) === captainId)) continue;
    // A locked player must stay in the XI. Without this the Bench Boost
    // tie-break silently overwrites the solver's lock.
    if (requiredStarterIds && benchCandidate.some((player) => requiredStarterIds.has(idOf(player)))) continue;
    if (requiredBenchIds) {
      const benched = new Set(benchCandidate.map(idOf));
      if ([...requiredBenchIds].some((id) => !benched.has(id))) continue;
    }
    if (benchCandidate.filter((player) => player.position === "GKP").length !== 1) continue;
    const benchIds = new Set(benchCandidate.map(idOf));
    const startersCandidate = squad.filter((player) => !benchIds.has(idOf(player)));
    if (startersCandidate.length !== 11) continue;
    if (startersCandidate.filter((player) => player.position === "GKP").length !== 1) continue;
    const formation = formationFrom(startersCandidate);
    if (!FORMATIONS[formation]) continue;
    if (onlyFormation && formation !== onlyFormation) continue;
    const xiCost = startersCandidate.reduce((sum, player) => sum + priceOf(player), 0);
    if (xiCost > xiMaximum + 1e-9) continue;
    const benchCost = benchCandidate.reduce((sum, player) => sum + priceOf(player), 0);
    if (benchCost + 1e-9 < benchMinimum) continue;
    const xiScore = startersCandidate.reduce((sum, player) => sum + finite(scoreForGw(player, gw)), 0);
    const key = [
      -Math.round(xiScore * SCORE_SCALE),
      Math.round(xiCost * PRICE_SCALE),
      startersCandidate.map(idOf).sort((a, b) => a - b).join(","),
    ];
    if (!best || firstKeyIsBetter(key, best.key)) {
      best = { key, starters: startersCandidate, bench: benchCandidate };
    }
  }
  return best;
}

function rankForWeek(players, scoreForGw, gw) {
  return [...players].sort((a, b) =>
    finite(scoreForGw(b, gw)) - finite(scoreForGw(a, gw))
    || priceOf(a) - priceOf(b)
    || idOf(a) - idOf(b));
}

function rankBenchForWeek(players, scoreForGw, gw) {
  const goalkeepers = rankForWeek(players.filter((player) => player.position === "GKP"), scoreForGw, gw);
  const outfield = rankForWeek(players.filter((player) => player.position !== "GKP"), scoreForGw, gw);
  return [...goalkeepers, ...outfield];
}

function buildLp({
  eligible,
  weeks,
  chips,
  scoreForGw,
  totalBudgetUnits,
  minimumSquadSpendUnits,
  xiMaximumUnits,
  benchMinimumUnits,
  maxPerClub,
  requiredSet,
  lockSet,
  lockGwSet,
  benchSet,
  benchGwSet,
  onlyFormation,
  goalkeeperMaxPriceUnits,
  minimumGoalkeepersAtOrBelowPrice,
}) {
  const objectiveTerms = [];
  const rows = [];
  const binaries = [];
  const x = (id) => `x_${id}`;
  const s = (gw, id) => `s_${gw}_${id}`;
  const c = (gw, id) => `c_${gw}_${id}`;

  for (const player of eligible) {
    const id = idOf(player);
    binaries.push(x(id));
    for (const gw of weeks) {
      binaries.push(s(gw, id), c(gw, id));
      const score = scoreUnits(scoreForGw(player, gw));
      const chip = chips.get(gw);
      if (chip === "benchboost") objectiveTerms.push(term(score, x(id)));
      else objectiveTerms.push(term(score, s(gw, id)));
      objectiveTerms.push(term(score * (chip === "triplecaptain" ? 2 : 1), c(gw, id)));
    }
  }

  rows.push(constraint("squad_size", eligible.map((p) => term(1, x(idOf(p)))), "=", 15));
  rows.push(constraint("total_budget", eligible.map((p) => term(priceUnits(p), x(idOf(p)))), "<=", totalBudgetUnits));
  if (minimumSquadSpendUnits !== null) {
    rows.push(constraint("minimum_squad_spend", eligible.map((p) => term(priceUnits(p), x(idOf(p)))), ">=", minimumSquadSpendUnits));
  }
  for (const position of POSITIONS) {
    rows.push(constraint(`squad_${position}`, eligible.filter((p) => p.position === position)
      .map((p) => term(1, x(idOf(p)))), "=", COMPOSITION[position]));
  }
  if (goalkeeperMaxPriceUnits !== null) {
    rows.push(constraint(
      "goalkeepers_at_or_below_price",
      eligible.filter((player) => player.position === "GKP" && priceUnits(player) <= goalkeeperMaxPriceUnits)
        .map((player) => term(1, x(idOf(player)))),
      ">=",
      minimumGoalkeepersAtOrBelowPrice,
    ));
  }
  const clubIds = [...new Set(eligible.map((p) => Number(p.team_id)))].sort((a, b) => a - b);
  for (const clubId of clubIds) {
    rows.push(constraint(`club_${clubId}`, eligible.filter((p) => Number(p.team_id) === clubId)
      .map((p) => term(1, x(idOf(p)))), "<=", maxPerClub));
  }
  for (const id of requiredSet) rows.push(constraint(`required_${id}`, [term(1, x(id))], "=", 1));

  for (const gw of weeks) {
    rows.push(constraint(`starters_${gw}`, eligible.map((p) => term(1, s(gw, idOf(p)))), "=", 11));
    rows.push(constraint(`captain_${gw}`, eligible.map((p) => term(1, c(gw, idOf(p)))), "=", 1));
    rows.push(constraint(`xi_budget_${gw}`, eligible.map((p) => term(priceUnits(p), s(gw, idOf(p)))), "<=", xiMaximumUnits));
    rows.push(constraint(`bench_min_${gw}`, eligible.flatMap((p) => [
      term(priceUnits(p), x(idOf(p))), term(-priceUnits(p), s(gw, idOf(p))),
    ]), ">=", benchMinimumUnits));

    if (onlyFormation) {
      for (const position of POSITIONS) {
        rows.push(constraint(`xi_${gw}_${position}`, eligible.filter((p) => p.position === position)
          .map((p) => term(1, s(gw, idOf(p)))), "=", FORMATIONS[onlyFormation][position]));
      }
    } else {
      rows.push(constraint(`xi_${gw}_GKP`, eligible.filter((p) => p.position === "GKP")
        .map((p) => term(1, s(gw, idOf(p)))), "=", 1));
      rows.push(constraint(`xi_${gw}_DEF_min`, eligible.filter((p) => p.position === "DEF")
        .map((p) => term(1, s(gw, idOf(p)))), ">=", 3));
      rows.push(constraint(`xi_${gw}_DEF_max`, eligible.filter((p) => p.position === "DEF")
        .map((p) => term(1, s(gw, idOf(p)))), "<=", 5));
      rows.push(constraint(`xi_${gw}_MID_min`, eligible.filter((p) => p.position === "MID")
        .map((p) => term(1, s(gw, idOf(p)))), ">=", 2));
      rows.push(constraint(`xi_${gw}_MID_max`, eligible.filter((p) => p.position === "MID")
        .map((p) => term(1, s(gw, idOf(p)))), "<=", 5));
      rows.push(constraint(`xi_${gw}_FWD_min`, eligible.filter((p) => p.position === "FWD")
        .map((p) => term(1, s(gw, idOf(p)))), ">=", 1));
      rows.push(constraint(`xi_${gw}_FWD_max`, eligible.filter((p) => p.position === "FWD")
        .map((p) => term(1, s(gw, idOf(p)))), "<=", 3));
    }

    for (const player of eligible) {
      const id = idOf(player);
      rows.push(constraint(`start_link_${gw}_${id}`, [term(1, s(gw, id)), term(-1, x(id))], "<=", 0));
      rows.push(constraint(`captain_link_${gw}_${id}`, [term(1, c(gw, id)), term(-1, s(gw, id))], "<=", 0));
      if (lockSet.has(id) && (!lockGwSet || lockGwSet.has(gw))) {
        rows.push(constraint(`lock_${gw}_${id}`, [term(1, s(gw, id))], "=", 1));
      }
      if (benchSet.has(id) && (!benchGwSet || benchGwSet.has(gw))) {
        rows.push(constraint(`benchlock_${gw}_${id}`, [term(1, s(gw, id))], "=", 0));
      }
    }
  }

  const lp = [
    "Maximize",
    ` objective: ${linearExpression(objectiveTerms)}`,
    "Subject To",
    ...rows,
    "Binary",
    ...binaries.map((name) => ` ${name}`),
    "End",
  ].join("\n");
  return { lp, binaries, rowCount: rows.length, variableCount: binaries.length };
}

export async function buildExactSquadForRange({
  pool = [], scoreForGw = () => 0, gwFrom = 1, gwTo = gwFrom,
  chipForGw = () => null, transferHitForGw = () => 0,
  locks = [], lockGameweeks = null, benchLocks = [], benchGameweeks = null,
  ignores = [], keep = [], budget = 100, benchBudget = 17,
  minimumMoneyInBank = 0,
  maximumMoneyInBank = null,
  goalkeeperMaxPrice = null,
  minimumGoalkeepersAtOrBelowPrice = 1,
  maxPerClub = 3, startProbOf = null, minStart = 0.55,
  onlyFormation = null,
} = {}) {
  const range = exactRange(gwFrom, gwTo);
  if (!range) return { ok: false, error: "The Builder range must be an exact inclusive range within GW1-GW8." };
  if (onlyFormation && !FORMATIONS[onlyFormation]) return { ok: false, error: `Unsupported formation ${onlyFormation}.` };

  const totalBudget = finite(budget) || 100;
  const bankMinimum = Math.max(0, finite(minimumMoneyInBank));
  if (bankMinimum >= totalBudget) return { ok: false, error: "minimumMoneyInBank must be lower than the total budget." };
  const parsedMaximumMoneyInBank = maximumMoneyInBank === null || maximumMoneyInBank === undefined || maximumMoneyInBank === ""
    ? null
    : Math.max(0, finite(maximumMoneyInBank));
  if (parsedMaximumMoneyInBank !== null && parsedMaximumMoneyInBank < bankMinimum - 1e-9) {
    return { ok: false, error: "maximumMoneyInBank cannot be lower than minimumMoneyInBank." };
  }
  if (parsedMaximumMoneyInBank !== null && parsedMaximumMoneyInBank >= totalBudget) {
    return { ok: false, error: "maximumMoneyInBank must be lower than the total budget." };
  }
  const spendableBudget = totalBudget - bankMinimum;
  const minimumSquadSpend = parsedMaximumMoneyInBank === null ? null : totalBudget - parsedMaximumMoneyInBank;
  const benchMinimum = Math.max(0, finite(benchBudget));
  if (benchMinimum > spendableBudget) return { ok: false, error: "The minimum bench spend exceeds the spendable squad budget." };
  const xiMaximum = spendableBudget - benchMinimum;
  const parsedGoalkeeperMaxPrice = goalkeeperMaxPrice === null || goalkeeperMaxPrice === undefined || goalkeeperMaxPrice === ""
    ? null
    : finite(goalkeeperMaxPrice);
  if (parsedGoalkeeperMaxPrice !== null && parsedGoalkeeperMaxPrice <= 0) {
    return { ok: false, error: "goalkeeperMaxPrice must be a positive price when supplied." };
  }
  const minimumCheapGoalkeepers = parsedGoalkeeperMaxPrice === null
    ? 0
    : Number(minimumGoalkeepersAtOrBelowPrice);
  if (parsedGoalkeeperMaxPrice !== null
    && (!Number.isInteger(minimumCheapGoalkeepers)
      || minimumCheapGoalkeepers < 1
      || minimumCheapGoalkeepers > COMPOSITION.GKP)) {
    return { ok: false, error: "minimumGoalkeepersAtOrBelowPrice must be 1 or 2 when goalkeeperMaxPrice is supplied." };
  }

  const lockSet = new Set((locks || []).map(Number));
  const benchSet = new Set((benchLocks || []).map(Number));
  const benchGwSet = Array.isArray(benchGameweeks) && benchGameweeks.length
    ? new Set(benchGameweeks.map(Number).filter(Number.isInteger))
    : null;
  const lockGwSet = Array.isArray(lockGameweeks) && lockGameweeks.length
    ? new Set(lockGameweeks.map(Number).filter(Number.isInteger))
    : null;
  const keepSet = new Set((keep || []).map(Number));
  const ignoreSet = new Set((ignores || []).map(Number));
  const requiredSet = new Set([...lockSet, ...keepSet, ...benchSet]);
  for (const id of requiredSet) {
    if (ignoreSet.has(id)) return { ok: false, error: `Player ${id} cannot be both required and ignored.` };
  }

  const eligible = [];
  const seenIds = new Set();
  for (const player of pool || []) {
    const id = idOf(player);
    const teamId = Number(player?.team_id);
    if (!Number.isFinite(id) || seenIds.has(id) || !Number.isFinite(teamId)) continue;
    if (priceOf(player) <= 0 || !COMPOSITION[player?.position] || ignoreSet.has(id)) continue;
    if (!requiredSet.has(id)) {
      if (player?.status && player.status !== "a") continue;
      const probability = safeStartProbability(startProbOf, player);
      if (probability !== null && probability < minStart) continue;
    }
    seenIds.add(id);
    eligible.push(player);
  }
  const eligibleIds = new Set(eligible.map(idOf));
  for (const id of requiredSet) {
    if (!eligibleIds.has(id)) return { ok: false, error: `Required player ${id} is unavailable in the eligible pool.` };
  }
  if (eligible.length < 15) return { ok: false, error: "Fewer than 15 eligible players are available." };
  for (const position of POSITIONS) {
    if (eligible.filter((p) => p.position === position).length < COMPOSITION[position]) {
      return { ok: false, error: `Not enough eligible ${position} players are available.` };
    }
  }
  if (parsedGoalkeeperMaxPrice !== null) {
    const eligibleCheapGoalkeepers = eligible.filter((player) =>
      player.position === "GKP" && priceOf(player) <= parsedGoalkeeperMaxPrice + 1e-9);
    if (eligibleCheapGoalkeepers.length < minimumCheapGoalkeepers) {
      return {
        ok: false,
        error: `Only ${eligibleCheapGoalkeepers.length} eligible goalkeeper(s) cost £${parsedGoalkeeperMaxPrice.toFixed(1)}m or less; ${minimumCheapGoalkeepers} required.`,
      };
    }
  }

  const weeks = Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from + index);
  const chips = new Map(weeks.map((gw) => [gw, normaliseSquadChip(chipForGw(gw))]));
  const model = buildLp({
    eligible,
    weeks,
    chips,
    scoreForGw,
    totalBudgetUnits: Math.round(spendableBudget * PRICE_SCALE),
    minimumSquadSpendUnits: minimumSquadSpend === null ? null : Math.round(minimumSquadSpend * PRICE_SCALE),
    xiMaximumUnits: Math.round(xiMaximum * PRICE_SCALE),
    benchMinimumUnits: Math.round(benchMinimum * PRICE_SCALE),
    maxPerClub,
    requiredSet,
    lockSet,
    lockGwSet,
    benchSet,
    benchGwSet,
    onlyFormation,
    goalkeeperMaxPriceUnits: parsedGoalkeeperMaxPrice === null
      ? null
      : Math.round(parsedGoalkeeperMaxPrice * PRICE_SCALE),
    minimumGoalkeepersAtOrBelowPrice: minimumCheapGoalkeepers,
  });

  let solution;
  try {
    const highs = await getHighs();
    solution = highs.solve(model.lp, {
      output_flag: false,
      presolve: "on",
      mip_rel_gap: 0,
      mip_abs_gap: 0,
    });
  } catch (error) {
    return { ok: false, error: `HiGHS exact optimiser failed: ${error.message}` };
  }

  const rawStatus = String(solution?.Status || "Unknown");
  if (rawStatus.toLowerCase() !== "optimal") {
    return { ok: false, error: `HiGHS did not prove a global optimum. Status: ${rawStatus}.` };
  }
  try {
    assertIntegral(solution, model.binaries);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  const selectedPlayers = eligible.filter((player) => selected(solution, `x_${idOf(player)}`));
  if (selectedPlayers.length !== 15) {
    return { ok: false, error: `HiGHS selected ${selectedPlayers.length} players instead of 15.` };
  }
  const selectedCheapGoalkeepers = parsedGoalkeeperMaxPrice === null
    ? []
    : selectedPlayers.filter((player) =>
      player.position === "GKP" && priceOf(player) <= parsedGoalkeeperMaxPrice + 1e-9);
  if (parsedGoalkeeperMaxPrice !== null && selectedCheapGoalkeepers.length < minimumCheapGoalkeepers) {
    return { ok: false, error: "HiGHS returned a squad that violated the goalkeeper price constraint." };
  }

  const weekly = [];
  let reconstructedObjectiveUnits = 0;
  for (const gw of weeks) {
    const chip = chips.get(gw);
    let starters = selectedPlayers.filter((player) => selected(solution, `s_${gw}_${idOf(player)}`));
    let bench = selectedPlayers.filter((player) => !selected(solution, `s_${gw}_${idOf(player)}`));
    const captain = selectedPlayers.find((player) => selected(solution, `c_${gw}_${idOf(player)}`));
    if (starters.length !== 11 || bench.length !== 4 || !captain || !starters.some((p) => idOf(p) === idOf(captain))) {
      return { ok: false, error: `HiGHS returned an invalid GW${gw} XI/captain assignment.` };
    }

    let benchBoostSplitTieBroken = false;
    if (chip === "benchboost") {
      const lockedForGw = (!lockGwSet || lockGwSet.has(gw))
        ? new Set([...lockSet].filter((id) => selectedPlayers.some((p) => idOf(p) === id)))
        : null;
      const benchedForGw = (!benchGwSet || benchGwSet.has(gw))
        ? new Set([...benchSet].filter((id) => selectedPlayers.some((p) => idOf(p) === id)))
        : null;
      const split = bestBenchBoostSplit({
        squad: selectedPlayers,
        captain,
        scoreForGw,
        gw,
        xiMaximum,
        benchMinimum,
        onlyFormation,
        requiredStarterIds: lockedForGw && lockedForGw.size ? lockedForGw : null,
        requiredBenchIds: benchedForGw && benchedForGw.size ? benchedForGw : null,
      });
      if (!split) {
        return { ok: false, error: lockedForGw && lockedForGw.size
          ? `GW${gw} Bench Boost has no legal XI that starts every locked player.`
          : `GW${gw} Bench Boost XI tie-break found no legal split.` };
      }
      starters = split.starters;
      bench = split.bench;
      benchBoostSplitTieBroken = true;
    }

    const formation = formationFrom(starters);
    if (!FORMATIONS[formation] || (onlyFormation && formation !== onlyFormation)) {
      return { ok: false, error: `HiGHS returned illegal GW${gw} formation ${formation}.` };
    }
    const xiCost = starters.reduce((sum, p) => sum + priceOf(p), 0);
    const benchCost = bench.reduce((sum, p) => sum + priceOf(p), 0);
    if (xiCost > xiMaximum + 1e-9 || benchCost + 1e-9 < benchMinimum) {
      return { ok: false, error: `HiGHS returned an invalid GW${gw} budget split.` };
    }

    const rankedStarters = rankForWeek(starters, scoreForGw, gw);
    const vice = rankedStarters.find((p) => idOf(p) !== idOf(captain)) || null;
    const rankedBench = rankBenchForWeek(bench, scoreForGw, gw);
    if (rankedBench[0]?.position !== "GKP") {
      return { ok: false, error: `GW${gw} bench order did not place the backup goalkeeper first.` };
    }
    const markedPlayers = [
      ...starters.map((p) => ({ ...p, starting: true })),
      ...rankedBench.map((p) => ({ ...p, starting: false })),
    ];
    const projection = projectSquad({
      players: markedPlayers,
      captain: idOf(captain),
      chip,
      transferHit: transferHitForGw(gw),
      scoreOf: (player) => finite(scoreForGw(player, gw)),
    });

    const weekBase = chip === "benchboost" ? selectedPlayers : starters;
    reconstructedObjectiveUnits += weekBase.reduce((sum, p) => sum + scoreUnits(scoreForGw(p, gw)), 0);
    reconstructedObjectiveUnits += scoreUnits(scoreForGw(captain, gw)) * (chip === "triplecaptain" ? 2 : 1);

    weekly.push({
      gw,
      chip,
      formation,
      starters: starters.map((p) => playerRow(p, scoreForGw(p, gw))),
      bench: rankedBench.map((p) => playerRow(p, scoreForGw(p, gw))),
      captain: idOf(captain),
      vice_captain: vice ? idOf(vice) : null,
      bench_order: rankedBench.map(idOf),
      bench_order_policy: "backup_gkp_first_then_outfield_descending_xpts",
      xi_selection_policy: benchBoostSplitTieBroken
        ? "bench_boost_tie_break_maximise_xi_xpts"
        : "solver_optimal_xi",
      xi_cost: rounded(xiCost),
      bench_cost: rounded(benchCost),
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

  const solverObjectiveUnits = Math.round(finite(solution?.ObjectiveValue));
  if (Math.abs(solverObjectiveUnits - reconstructedObjectiveUnits) > 1) {
    return { ok: false, error: `Optimal objective proof mismatch: HiGHS ${solverObjectiveUnits}, reconstructed ${reconstructedObjectiveUnits}.` };
  }

  const sum = (key) => weekly.reduce((total, row) => total + finite(row[key]), 0);
  const total = {
    starting_xpts: sum("starting_xpts"),
    captain_bonus: sum("captain_bonus"),
    bench_boost_bonus: sum("bench_boost_bonus"),
    requested_transfer_hit: sum("requested_transfer_hit"),
    transfer_hit: sum("transfer_hit"),
    wildcard_saving: sum("wildcard_saving"),
    gross_xpts: sum("gross_xpts"),
    net_xpts: sum("net_xpts"),
  };
  const expectedNet = solverObjectiveUnits / SCORE_SCALE - total.transfer_hit;
  if (Math.abs(total.net_xpts - expectedNet) > 0.001) {
    return { ok: false, error: `Net xPTS proof mismatch: output ${total.net_xpts}, exact objective ${expectedNet}.` };
  }

  const firstWeek = weekly[0];
  const selectedById = new Map(selectedPlayers.map((p) => [idOf(p), p]));
  const xi = firstWeek.starters.map((row) => ({ ...selectedById.get(idOf(row)), starting: true }));
  const bench = firstWeek.bench.map((row) => ({ ...selectedById.get(idOf(row)), starting: false }));
  const totalCost = selectedPlayers.reduce((sumPrice, p) => sumPrice + priceOf(p), 0);
  const moneyInBank = totalBudget - totalCost;
  if (moneyInBank + 1e-9 < bankMinimum) {
    return { ok: false, error: `HiGHS returned only £${rounded(moneyInBank).toFixed(1)}m in the bank; £${bankMinimum.toFixed(1)}m required.` };
  }
  if (parsedMaximumMoneyInBank !== null && moneyInBank > parsedMaximumMoneyInBank + 1e-9) {
    return { ok: false, error: `HiGHS left £${rounded(moneyInBank).toFixed(1)}m in the bank; maximum £${parsedMaximumMoneyInBank.toFixed(1)}m allowed.` };
  }

  return {
    ok: true,
    xi,
    bench,
    formation: firstWeek.formation,
    captain: firstWeek.captain,
    vice: firstWeek.vice_captain,
    weekly,
    total,
    xp: rounded(total.net_xpts),
    cost: rounded(totalCost),
    totalBudget: rounded(totalBudget),
    spendableBudget: rounded(spendableBudget),
    minimumMoneyInBank: rounded(bankMinimum),
    maximumMoneyInBank: parsedMaximumMoneyInBank === null ? null : rounded(parsedMaximumMoneyInBank),
    minimumSquadSpend: minimumSquadSpend === null ? null : rounded(minimumSquadSpend),
    moneyInBank: rounded(moneyInBank),
    goalkeeperMaxPrice: parsedGoalkeeperMaxPrice === null ? null : rounded(parsedGoalkeeperMaxPrice),
    minimumGoalkeepersAtOrBelowPrice: minimumCheapGoalkeepers,
    goalkeepersAtOrBelowPrice: selectedCheapGoalkeepers.map((player) => playerRow(player, 0)),
    xiCost: firstWeek.xi_cost,
    benchCost: firstWeek.bench_cost,
    benchBudget: benchMinimum,
    benchOrderPolicy: "backup_gkp_first_then_outfield_descending_xpts",
    search: "HiGHS exact mixed-integer global optimisation",
    solver: {
      engine: "HiGHS",
      package: "highs",
      version: ENGINE_VERSION,
      raw_status: rawStatus,
      status: "OPTIMAL",
      optimality_proven: true,
      mip_gap: 0,
      requested_mip_rel_gap: 0,
      requested_mip_abs_gap: 0,
      timeout_used: false,
      fallback_used: false,
      score_scale: SCORE_SCALE,
      objective_gross_xpts: solverObjectiveUnits / SCORE_SCALE,
      objective_net_xpts: expectedNet,
      eligible_player_count: eligible.length,
      binary_variable_count: model.variableCount,
      constraint_count: model.rowCount,
    },
  };
}
