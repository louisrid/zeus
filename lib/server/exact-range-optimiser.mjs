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

function rankForWeek(players, scoreForGw, gw) {
  return [...players].sort((a, b) =>
    finite(scoreForGw(b, gw)) - finite(scoreForGw(a, gw))
    || priceOf(a) - priceOf(b)
    || idOf(a) - idOf(b));
}

function buildLp({ eligible, weeks, chips, scoreForGw, totalBudgetUnits, xiMaximumUnits,
  benchMinimumUnits, maxPerClub, requiredSet, lockSet, onlyFormation }) {
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
  for (const position of POSITIONS) {
    rows.push(constraint(`squad_${position}`, eligible.filter((p) => p.position === position)
      .map((p) => term(1, x(idOf(p)))), "=", COMPOSITION[position]));
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
      if (lockSet.has(id)) rows.push(constraint(`lock_${gw}_${id}`, [term(1, s(gw, id))], "=", 1));
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
  locks = [], ignores = [], keep = [], budget = 100, benchBudget = 17,
  maxPerClub = 3, startProbOf = null, minStart = 0.55,
  onlyFormation = null,
} = {}) {
  const range = exactRange(gwFrom, gwTo);
  if (!range) return { ok: false, error: "The Builder range must be an exact inclusive range within GW1-GW8." };
  if (onlyFormation && !FORMATIONS[onlyFormation]) return { ok: false, error: `Unsupported formation ${onlyFormation}.` };

  const totalBudget = finite(budget) || 100;
  const benchMinimum = Math.max(0, finite(benchBudget));
  const xiMaximum = totalBudget - benchMinimum;
  const lockSet = new Set((locks || []).map(Number));
  const keepSet = new Set((keep || []).map(Number));
  const ignoreSet = new Set((ignores || []).map(Number));
  const requiredSet = new Set([...lockSet, ...keepSet]);
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

  const weeks = Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from + index);
  const chips = new Map(weeks.map((gw) => [gw, normaliseSquadChip(chipForGw(gw))]));
  const model = buildLp({
    eligible,
    weeks,
    chips,
    scoreForGw,
    totalBudgetUnits: Math.round(totalBudget * PRICE_SCALE),
    xiMaximumUnits: Math.round(xiMaximum * PRICE_SCALE),
    benchMinimumUnits: Math.round(benchMinimum * PRICE_SCALE),
    maxPerClub,
    requiredSet,
    lockSet,
    onlyFormation,
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

  const weekly = [];
  let reconstructedObjectiveUnits = 0;
  for (const gw of weeks) {
    const starters = selectedPlayers.filter((player) => selected(solution, `s_${gw}_${idOf(player)}`));
    const bench = selectedPlayers.filter((player) => !selected(solution, `s_${gw}_${idOf(player)}`));
    const captain = selectedPlayers.find((player) => selected(solution, `c_${gw}_${idOf(player)}`));
    if (starters.length !== 11 || bench.length !== 4 || !captain || !starters.some((p) => idOf(p) === idOf(captain))) {
      return { ok: false, error: `HiGHS returned an invalid GW${gw} XI/captain assignment.` };
    }
    const chip = chips.get(gw);
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
    const rankedBench = rankForWeek(bench, scoreForGw, gw);
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
  const firstStarterIds = new Set(firstWeek.starters.map(idOf));
  const selectedById = new Map(selectedPlayers.map((p) => [idOf(p), p]));
  const xi = firstWeek.starters.map((row) => ({ ...selectedById.get(idOf(row)), starting: true }));
  const bench = firstWeek.bench.map((row) => ({ ...selectedById.get(idOf(row)), starting: false }));
  const totalCost = selectedPlayers.reduce((sumPrice, p) => sumPrice + priceOf(p), 0);

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
    xiCost: firstWeek.xi_cost,
    benchCost: firstWeek.bench_cost,
    benchBudget: benchMinimum,
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
