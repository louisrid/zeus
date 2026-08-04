/* BEST XI, BUILT AROUND YOUR LOCKS.
 *
 * The job: maximise the fielded eleven over the selected horizon while reserving a hard ceiling
 * for the four substitutes. The XI and bench are separate optimisation stages: first maximise the
 * XI inside its budget, then maximise the legal bench inside its own budget. Locked players remain
 * in the XI, kept players remain in the final fifteen, and ignored players cannot be selected.
 */

const FORMATIONS = [[3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 2, 3], [5, 3, 2], [5, 4, 1]];
const QUOTAS = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const POSITIONS = ["GKP", "DEF", "MID", "FWD"];
const DEFAULT_BENCH_BUDGET = 17;
const EPS = 1e-9;

export function bestXI({
  pool,
  xpOf,
  locks = [],
  ignores = [],
  keep = [],
  budget = 100,
  benchBudget = DEFAULT_BENCH_BUDGET,
  maxPerClub = 3,
  startProbOf = null,
  minStart = 0.55,
  onlyFormation = null,
}) {
  const price = (p) => Number(p.price);
  const xp = (p) => {
    const value = xpOf(p);
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  };
  const name = (p) => String(p.web_name || p.name || p.fpl_id || "");
  const stable = (a, b) => name(a).localeCompare(name(b)) || Number(a.fpl_id) - Number(b.fpl_id);
  const byXp = (a, b) => xp(b) - xp(a) || price(a) - price(b) || stable(a, b);
  const byCheap = (a, b) => price(a) - price(b) || xp(b) - xp(a) || stable(a, b);
  const sumPrice = (players) => players.reduce((sum, player) => sum + price(player), 0);
  const sumXp = (players) => players.reduce((sum, player) => sum + xp(player), 0);

  const totalBudget = Number.isFinite(Number(budget)) ? Number(budget) : 100;
  const benchCap = Math.max(0, Math.min(totalBudget, Number.isFinite(Number(benchBudget)) ? Number(benchBudget) : DEFAULT_BENCH_BUDGET));
  const xiCap = Math.max(0, totalBudget - benchCap);
  const lockSet = new Set(locks.map(Number));
  const keepSet = new Set(keep.map(Number));
  const ignoreSet = new Set(ignores.map(Number));

  const cand = (pool || []).filter((player) => {
    const id = Number(player.fpl_id);
    return Number.isFinite(price(player)) && price(player) > 0
      && (lockSet.has(id) || keepSet.has(id) || !ignoreSet.has(id));
  });
  if (cand.length < 15) return null;

  const startsEnough = (player) => {
    if (lockSet.has(Number(player.fpl_id))) return true;
    if (!startProbOf) return true;
    const probability = startProbOf(player);
    return probability === null || probability === undefined || Number(probability) >= minStart;
  };
  const fieldable = cand.filter(startsEnough);
  if (fieldable.filter((player) => player.position === "GKP").length < 1) return null;

  const lockedList = cand.filter((player) => lockSet.has(Number(player.fpl_id)));
  const keepList = cand.filter((player) => keepSet.has(Number(player.fpl_id)) && !lockSet.has(Number(player.fpl_id)));
  const byPos = {};
  const benchPos = {};
  for (const pos of POSITIONS) {
    byPos[pos] = fieldable.filter((player) => player.position === pos).sort(byXp);
    benchPos[pos] = cand.filter((player) => player.position === pos).sort(byCheap);
  }

  let best = null;
  const shapes = onlyFormation
    ? FORMATIONS.filter(([d, m, f]) => `${d}-${m}-${f}` === onlyFormation)
    : FORMATIONS;

  for (const [d, m, f] of (shapes.length ? shapes : FORMATIONS)) {
    const need = { GKP: 1, DEF: d, MID: m, FWD: f };
    const lockCount = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of lockedList) lockCount[player.position] += 1;
    if (POSITIONS.some((pos) => lockCount[pos] > need[pos])) continue;

    const club = new Map();
    const seat = (player) => club.set(player.team_id, (club.get(player.team_id) || 0) + 1);
    const unseat = (player) => club.set(player.team_id, Math.max(0, (club.get(player.team_id) || 0) - 1));
    const roomAt = (player) => (club.get(player.team_id) || 0) < maxPerClub;
    const xi = [...lockedList];
    const chosen = new Set(xi.map((player) => Number(player.fpl_id)));
    xi.forEach(seat);

    let feasible = true;
    for (const pos of POSITIONS) {
      let slots = need[pos] - xi.filter((player) => player.position === pos).length;
      const mandatory = keepList.filter((player) => player.position === pos && !chosen.has(Number(player.fpl_id)));
      const benchCapacity = QUOTAS[pos] - need[pos];
      const mustStart = Math.max(0, mandatory.length - benchCapacity);

      // Expensive kept players are seated first when some kept players must start. That prevents an
      // avoidable expensive bench from consuming the entire £17m allowance.
      const forced = mandatory.filter(startsEnough)
        .sort((a, b) => price(b) - price(a) || byXp(a, b))
        .slice(0, mustStart);
      if (forced.length < mustStart) { feasible = false; break; }
      for (const player of forced) {
        if (slots <= 0 || !roomAt(player)) { feasible = false; break; }
        xi.push(player);
        chosen.add(Number(player.fpl_id));
        seat(player);
        slots -= 1;
      }
      if (!feasible) break;

      const ranked = [...new Set([...mandatory.filter(startsEnough), ...byPos[pos]])].sort(byXp);
      for (const player of ranked) {
        if (slots <= 0) break;
        const id = Number(player.fpl_id);
        if (chosen.has(id) || !roomAt(player)) continue;
        const remainingMandatory = mandatory.filter((item) => !chosen.has(Number(item.fpl_id)) && Number(item.fpl_id) !== id).length;
        if (!keepSet.has(id) && remainingMandatory > benchCapacity) continue;
        xi.push(player);
        chosen.add(id);
        seat(player);
        slots -= 1;
      }
      if (slots > 0) { feasible = false; break; }
    }
    if (!feasible || xi.length !== 11) continue;

    const replaceXi = (outgoing, incoming) => {
      xi[xi.indexOf(outgoing)] = incoming;
      chosen.delete(Number(outgoing.fpl_id));
      chosen.add(Number(incoming.fpl_id));
      unseat(outgoing);
      seat(incoming);
    };

    // The XI has its own hard £83m ceiling. Repair by taking the downgrade that loses the least xP
    // per pound saved, then spend any remaining XI money on the best legal upgrades.
    let repairGuard = 400;
    while (sumPrice(xi) > xiCap + EPS && repairGuard-- > 0) {
      let bestDowngrade = null;
      for (const outgoing of xi) {
        const outId = Number(outgoing.fpl_id);
        if (lockSet.has(outId) || keepSet.has(outId)) continue;
        for (const incoming of byPos[outgoing.position]) {
          const inId = Number(incoming.fpl_id);
          if (chosen.has(inId) || price(incoming) >= price(outgoing) - EPS) continue;
          if (incoming.team_id !== outgoing.team_id && !roomAt(incoming)) continue;
          const saving = price(outgoing) - price(incoming);
          const loss = xp(outgoing) - xp(incoming);
          const rate = loss / saving;
          if (!bestDowngrade || rate < bestDowngrade.rate - EPS
            || (Math.abs(rate - bestDowngrade.rate) <= EPS && loss < bestDowngrade.loss - EPS)) {
            bestDowngrade = { outgoing, incoming, rate, loss };
          }
        }
      }
      if (!bestDowngrade) break;
      replaceXi(bestDowngrade.outgoing, bestDowngrade.incoming);
    }
    if (sumPrice(xi) > xiCap + EPS) continue;

    let upgradeGuard = 500;
    while (upgradeGuard-- > 0) {
      const spare = xiCap - sumPrice(xi);
      let bestUpgrade = null;
      for (const outgoing of xi) {
        const outId = Number(outgoing.fpl_id);
        if (lockSet.has(outId) || keepSet.has(outId)) continue;
        for (const incoming of byPos[outgoing.position]) {
          const inId = Number(incoming.fpl_id);
          if (chosen.has(inId)) continue;
          const extra = price(incoming) - price(outgoing);
          if (extra > spare + EPS) continue;
          if (incoming.team_id !== outgoing.team_id && !roomAt(incoming)) continue;
          const gain = xp(incoming) - xp(outgoing);
          if (gain <= EPS) continue;
          const value = extra > EPS ? gain / extra : gain * 1000;
          if (!bestUpgrade || value > bestUpgrade.value + EPS
            || (Math.abs(value - bestUpgrade.value) <= EPS && gain > bestUpgrade.gain + EPS)) {
            bestUpgrade = { outgoing, incoming, value, gain };
          }
        }
      }
      if (!bestUpgrade) break;
      replaceXi(bestUpgrade.outgoing, bestUpgrade.incoming);
    }

    let settleGuard = 500;
    while (settleGuard-- > 0) {
      const spare = xiCap - sumPrice(xi);
      let bestGain = null;
      for (const outgoing of xi) {
        const outId = Number(outgoing.fpl_id);
        if (lockSet.has(outId) || keepSet.has(outId)) continue;
        for (const incoming of byPos[outgoing.position]) {
          const inId = Number(incoming.fpl_id);
          if (chosen.has(inId)) continue;
          if (price(incoming) - price(outgoing) > spare + EPS) continue;
          if (incoming.team_id !== outgoing.team_id && !roomAt(incoming)) continue;
          const gain = xp(incoming) - xp(outgoing);
          if (gain <= EPS) continue;
          if (!bestGain || gain > bestGain.gain + EPS
            || (Math.abs(gain - bestGain.gain) <= EPS && price(incoming) < price(bestGain.incoming) - EPS)) {
            bestGain = { outgoing, incoming, gain };
          }
        }
      }
      if (!bestGain) break;
      replaceXi(bestGain.outgoing, bestGain.incoming);
    }

    const bench = [];
    for (const pos of POSITIONS) {
      const slotsNeeded = QUOTAS[pos] - need[pos];
      const mandatoryBench = keepList.filter((player) => player.position === pos && !chosen.has(Number(player.fpl_id)));
      if (mandatoryBench.length > slotsNeeded) { feasible = false; break; }

      for (const player of mandatoryBench.sort(byCheap)) {
        if (!roomAt(player)) { feasible = false; break; }
        bench.push(player);
        chosen.add(Number(player.fpl_id));
        seat(player);
      }
      if (!feasible) break;

      let slots = slotsNeeded - mandatoryBench.length;
      for (const player of benchPos[pos]) {
        if (slots <= 0) break;
        const id = Number(player.fpl_id);
        if (chosen.has(id) || !roomAt(player)) continue;
        bench.push(player);
        chosen.add(id);
        seat(player);
        slots -= 1;
      }
      if (slots > 0) { feasible = false; break; }
    }
    if (!feasible || bench.length !== 4) continue;

    const replaceBench = (outgoing, incoming) => {
      bench[bench.indexOf(outgoing)] = incoming;
      chosen.delete(Number(outgoing.fpl_id));
      chosen.add(Number(incoming.fpl_id));
      unseat(outgoing);
      seat(incoming);
    };

    // A partial draft may force an expensive kept player onto the bench. Try to exchange that player
    // with a cheaper same-position starter before rejecting the formation.
    let keptRepairGuard = 20;
    while (sumPrice(bench) > benchCap + EPS && keptRepairGuard-- > 0) {
      let bestRepair = null;
      for (const benchPlayer of bench) {
        if (!keepSet.has(Number(benchPlayer.fpl_id))) continue;
        for (const starter of xi) {
          const starterId = Number(starter.fpl_id);
          if (starter.position !== benchPlayer.position || lockSet.has(starterId) || keepSet.has(starterId)) continue;
          const saving = price(benchPlayer) - price(starter);
          if (saving <= EPS) continue;
          const nextXiCost = sumPrice(xi) - price(starter) + price(benchPlayer);
          if (nextXiCost > xiCap + EPS) continue;
          const loss = xp(starter) - xp(benchPlayer);
          const rate = loss / saving;
          if (!bestRepair || rate < bestRepair.rate - EPS) bestRepair = { benchPlayer, starter, rate };
        }
      }
      if (!bestRepair) break;
      xi[xi.indexOf(bestRepair.starter)] = bestRepair.benchPlayer;
      bench[bench.indexOf(bestRepair.benchPlayer)] = bestRepair.starter;
    }
    if (sumPrice(bench) > benchCap + EPS) continue;

    // Optimise the four substitutes only after the XI is fixed. Every swap must stay inside the £17m
    // bench ceiling, the £100m total ceiling, the position quota and the three-per-club rule.
    let benchGuard = 500;
    while (benchGuard-- > 0) {
      const benchSpare = Math.min(benchCap - sumPrice(bench), totalBudget - sumPrice(xi) - sumPrice(bench));
      let bestBenchSwap = null;
      for (const outgoing of bench) {
        if (keepSet.has(Number(outgoing.fpl_id)) || lockSet.has(Number(outgoing.fpl_id))) continue;
        for (const incoming of cand) {
          const inId = Number(incoming.fpl_id);
          if (incoming.position !== outgoing.position || chosen.has(inId)) continue;
          const extra = price(incoming) - price(outgoing);
          if (extra > benchSpare + EPS) continue;
          if (incoming.team_id !== outgoing.team_id && !roomAt(incoming)) continue;
          const gain = xp(incoming) - xp(outgoing);
          if (gain <= EPS) continue;
          const value = extra > EPS ? gain / extra : gain * 1000;
          if (!bestBenchSwap || gain > bestBenchSwap.gain + EPS
            || (Math.abs(gain - bestBenchSwap.gain) <= EPS && value > bestBenchSwap.value + EPS)
            || (Math.abs(gain - bestBenchSwap.gain) <= EPS && Math.abs(value - bestBenchSwap.value) <= EPS
              && price(incoming) < price(bestBenchSwap.incoming) - EPS)) {
            bestBenchSwap = { outgoing, incoming, gain, value };
          }
        }
      }
      if (!bestBenchSwap) break;
      replaceBench(bestBenchSwap.outgoing, bestBenchSwap.incoming);
    }

    const finalIds = new Set([...xi, ...bench].map((player) => Number(player.fpl_id)));
    if (keepList.some((player) => !finalIds.has(Number(player.fpl_id)))) continue;
    if (lockedList.some((player) => !xi.some((item) => Number(item.fpl_id) === Number(player.fpl_id)))) continue;

    const xiCost = sumPrice(xi);
    const benchCost = sumPrice(bench);
    const totalCost = xiCost + benchCost;
    if (xiCost > xiCap + EPS || benchCost > benchCap + EPS || totalCost > totalBudget + EPS) continue;

    const xiXp = sumXp(xi);
    const benchXp = sumXp(bench);
    const better = !best
      || xiXp > best.xp + EPS
      || (Math.abs(xiXp - best.xp) <= EPS && benchXp > best.benchXp + EPS)
      || (Math.abs(xiXp - best.xp) <= EPS && Math.abs(benchXp - best.benchXp) <= EPS && totalCost < best.cost - EPS);
    if (!better) continue;

    const benchKeeper = bench.filter((player) => player.position === "GKP").sort(byXp);
    const benchOutfield = bench.filter((player) => player.position !== "GKP").sort(byXp);
    best = {
      xi: xi.map((player) => ({ ...player, starting: true })),
      bench: [...benchKeeper, ...benchOutfield].map((player) => ({ ...player, starting: false })),
      xp: Math.round(xiXp * 10) / 10,
      benchXp: Math.round(benchXp * 10) / 10,
      cost: Math.round(totalCost * 10) / 10,
      xiCost: Math.round(xiCost * 10) / 10,
      benchCost: Math.round(benchCost * 10) / 10,
      benchBudget: Math.round(benchCap * 10) / 10,
      formation: `${d}-${m}-${f}`,
    };
  }

  return best;
}


/* Improve a complete squad through legal, positive same-position swaps. Locks cannot leave, ignored
   players cannot enter, and every candidate is checked against the live bank, XI budget, bench budget
   and club limit after the outgoing player is removed. */
export function improveSquad({
  squad,
  pool,
  xpOf,
  locks = [],
  ignores = [],
  budget = 100,
  benchBudget = DEFAULT_BENCH_BUDGET,
  maxPerClub = 3,
}) {
  const xp = (player) => Number.isFinite(Number(xpOf(player))) ? Number(xpOf(player)) : 0;
  const price = (player) => Number(player.price) || 0;
  const totalBudget = Number.isFinite(Number(budget)) ? Number(budget) : 100;
  const benchCap = Math.max(0, Math.min(totalBudget, Number.isFinite(Number(benchBudget)) ? Number(benchBudget) : DEFAULT_BENCH_BUDGET));
  const xiCap = totalBudget - benchCap;
  const players = (squad.players || []).map((player) => ({ ...player }));
  const changes = [];
  let guard = 100;

  while (guard-- > 0) {
    const owned = new Set(players.map((player) => player.fpl_id));
    const clubs = new Map();
    for (const player of players) clubs.set(player.team_id, (clubs.get(player.team_id) || 0) + 1);
    let best = null;

    for (const outgoing of players) {
      if (locks.includes(outgoing.fpl_id)) continue;
      for (const incoming of pool || []) {
        if (incoming.position !== outgoing.position || owned.has(incoming.fpl_id) || ignores.includes(incoming.fpl_id)) continue;
        const next = players.map((player) => player.fpl_id === outgoing.fpl_id
          ? { ...incoming, starting: Boolean(outgoing.starting) }
          : player);
        const xiSpend = next.filter((player) => player.starting).reduce((sum, player) => sum + price(player), 0);
        const benchSpend = next.filter((player) => !player.starting).reduce((sum, player) => sum + price(player), 0);
        if (xiSpend > xiCap + EPS || benchSpend > benchCap + EPS || xiSpend + benchSpend > totalBudget + EPS) continue;
        const nextClubCount = (clubs.get(incoming.team_id) || 0) + (incoming.team_id === outgoing.team_id ? 0 : 1);
        if (nextClubCount > maxPerClub) continue;
        const gain = xp(incoming) - xp(outgoing);
        if (gain <= EPS) continue;
        const extra = price(incoming) - price(outgoing);
        if (!best || gain > best.gain + EPS || (Math.abs(gain - best.gain) <= EPS && extra < best.extra)) {
          best = { outgoing, incoming, gain, extra };
        }
      }
    }

    if (!best) break;
    const index = players.findIndex((player) => player.fpl_id === best.outgoing.fpl_id);
    players[index] = { ...best.incoming, starting: Boolean(best.outgoing.starting) };
    changes.push({ out: best.outgoing.fpl_id, in: best.incoming.fpl_id, gain: best.gain });
  }

  const starters = players.filter((player) => player.starting);
  const benchKeeper = players.filter((player) => !player.starting && player.position === "GKP")
    .sort((a, b) => xp(b) - xp(a));
  const benchOutfield = players.filter((player) => !player.starting && player.position !== "GKP")
    .sort((a, b) => xp(b) - xp(a) || price(a) - price(b));
  const ordered = [...starters, ...benchKeeper, ...benchOutfield];

  return {
    ...squad,
    players: ordered,
    changes,
    spend: Math.round(ordered.reduce((sum, player) => sum + price(player), 0) * 10) / 10,
    xiSpend: Math.round(starters.reduce((sum, player) => sum + price(player), 0) * 10) / 10,
    benchSpend: Math.round([...benchKeeper, ...benchOutfield].reduce((sum, player) => sum + price(player), 0) * 10) / 10,
  };
}
