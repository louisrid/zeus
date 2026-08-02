/* BEST XI, BUILT AROUND YOUR LOCKS.
 *
 * The job: maximise total xP of the fielded eleven over a horizon Louis sets, with the bench as
 * cheap as legality allows, because bench points are points you chose not to field. Locked players
 * are non-negotiable and the eleven is built around them.
 *
 * Method: try every legal formation. For each, seat the locks, fill each line greedily by xP, fill
 * the bench with the cheapest legal bodies, then repair the budget by swapping out whichever
 * unlocked starter costs the least xP per pound saved. Keep the best formation. Greedy-with-repair
 * is not a proof of optimality, and does not pretend to be; it is fast, respects every FPL rule
 * (100.0 budget, quotas 2-5-5-3, max 3 per club), and beats hand-assembly.
 */

const FORMATIONS = [[3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 2, 3], [5, 3, 2], [5, 4, 1]];
const QUOTAS = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };

export function bestXI({ pool, xpOf, locks = [], ignores = [], keep = [], budget = 100, maxPerClub = 3, startProbOf = null, minStart = 0.55, onlyFormation = null }) {
  const price = (p) => Number(p.price);
  const xp = (p) => { const v = xpOf(p); return Number.isFinite(Number(v)) ? Number(v) : 0; };
  // IGNORED players are never selected. Locks always win over an ignore, since a lock is explicit.
  const cand = (pool || []).filter((p) => Number.isFinite(price(p)) && price(p) > 0
    && (locks.includes(p.fpl_id) || keep.includes(p.fpl_id) || !ignores.includes(p.fpl_id)));
  if (cand.length < 15) return null;

  /* FIELDABLE means he actually starts. A cheap squad filler who never plays was appearing in the
     eleven because he cost nothing and the budget repair kept reaching for him. Anyone below the
     start threshold can still be bought as a bench body, which is the only thing he is for.
     A locked player is always fieldable: Louis overrules the model, not the reverse. */
  const startsEnough = (p) => {
    if (locks.includes(p.fpl_id)) return true;
    if (!startProbOf) return true;
    const s = startProbOf(p);
    /* An UNKNOWN start probability is not a disqualification. It used to require a positive projection as
       well, which meant that whenever projections were thin the whole pool failed the filter and the
       builder answered "no legal squad fits those locks" with no locks set. A player we know nothing about
       ranks last on xP anyway, so letting him through costs nothing and refusing outright breaks the
       button entirely. Only a start probability we KNOW to be low excludes anyone. */
    return s === null ? true : s >= minStart;
  };
  const fieldable = cand.filter(startsEnough);
  if (fieldable.filter((p) => p.position === "GKP").length < 1) return null;
  const lockedList = cand.filter((p) => locks.includes(p.fpl_id));
  const keepList = cand.filter((p) => keep.includes(p.fpl_id) && !locks.includes(p.fpl_id));
  const byPos = {};       // starters are drawn from fieldable players only
  const benchPos = {};    // bench is drawn from everyone, cheapest first
  for (const pos of Object.keys(QUOTAS)) {
    byPos[pos] = fieldable.filter((p) => p.position === pos).sort((a, b) => xp(b) - xp(a) || price(a) - price(b));
    benchPos[pos] = cand.filter((p) => p.position === pos).sort((a, b) => price(a) - price(b));
  }

  let best = null;
  // When the formation is locked, only that shape is considered.
  const shapes = onlyFormation
    ? FORMATIONS.filter(([d, m, f]) => `${d}-${m}-${f}` === onlyFormation)
    : FORMATIONS;
  for (const [d, m, f] of (shapes.length ? shapes : FORMATIONS)) {
    const need = { GKP: 1, DEF: d, MID: m, FWD: f };
    // Locks must fit the formation, or this formation is out.
    const lockCount = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of lockedList) lockCount[p.position]++;
    if (Object.keys(need).some((pos) => lockCount[pos] > need[pos])) continue;

    const club = new Map();
    const seat = (p) => club.set(p.team_id, (club.get(p.team_id) || 0) + 1);
    const unseat = (p) => club.set(p.team_id, club.get(p.team_id) - 1);
    const roomAt = (p) => (club.get(p.team_id) || 0) < maxPerClub;

    const keptList = cand.filter((p) => keep.includes(p.fpl_id) && !locks.includes(p.fpl_id));
    const xi = [...lockedList];
    const chosen = new Set(xi.map((p) => p.fpl_id));
    xi.forEach(seat);

    let feasible = true;
    for (const pos of Object.keys(need)) {
      let slots = need[pos] - xi.filter((p) => p.position === pos).length;
      const mandatory = keptList.filter((k) => k.position === pos && !chosen.has(k.fpl_id));
      const benchCapacity = QUOTAS[pos] - need[pos];
      const mustStart = Math.max(0, mandatory.length - benchCapacity);
      const forced = mandatory.filter(startsEnough)
        .sort((a, b) => xp(b) - xp(a) || price(a) - price(b))
        .slice(0, mustStart);
      if (forced.length < mustStart) { feasible = false; break; }
      for (const p of forced) {
        if (slots <= 0 || !roomAt(p)) { feasible = false; break; }
        xi.push(p); chosen.add(p.fpl_id); seat(p); slots--;
      }
      if (!feasible) break;
      // Fill the remaining starter places on xP, but reserve enough bench slots for every kept player.
      const ranked = [...new Set([...mandatory.filter(startsEnough), ...byPos[pos]])]
        .sort((a, b) => xp(b) - xp(a) || price(a) - price(b));
      for (const p of ranked) {
        if (slots <= 0) break;
        if (chosen.has(p.fpl_id) || !roomAt(p)) continue;
        const remainingMandatory = mandatory.filter((k) => !chosen.has(k.fpl_id) && k.fpl_id !== p.fpl_id).length;
        const remainingBenchCapacity = benchCapacity;
        if (!keep.includes(p.fpl_id) && remainingMandatory > remainingBenchCapacity) continue;
        xi.push(p); chosen.add(p.fpl_id); seat(p); slots--;
      }
      if (slots > 0) { feasible = false; break; }
    }
    if (!feasible) continue;

    // Bench: any remaining keeps first, so nothing already owned is dropped, then cheapest bodies.
    const bench = [];
    // Position quotas must be able to hold every keep, or this shape cannot honour them.
    for (const pos of Object.keys(QUOTAS)) {
      if (keepList.filter((k) => k.position === pos).length > QUOTAS[pos]) { feasible = false; break; }
    }
    if (!feasible) continue;
    for (const pos of Object.keys(QUOTAS)) {
      let slots = QUOTAS[pos] - need[pos] - bench.filter((b) => b.position === pos).length;
      const mandatoryBench = keptList.filter((k) => k.position === pos && !chosen.has(k.fpl_id));
      if (mandatoryBench.length > slots) { feasible = false; break; }
      for (const p of mandatoryBench) {
        if (!roomAt(p)) { feasible = false; break; }
        bench.push(p); chosen.add(p.fpl_id); seat(p); slots--;
      }
      if (!feasible) break;
      for (const p of benchPos[pos]) {
        if (slots <= 0) break;
        if (chosen.has(p.fpl_id) || !roomAt(p)) continue;
        bench.push(p); chosen.add(p.fpl_id); seat(p); slots--;
      }
      if (slots > 0) { feasible = false; break; }
    }
    if (!feasible) continue;

    // Budget repair: swap out the unlocked starter whose downgrade loses the least xP per pound.
    const spend = () => [...xi, ...bench].reduce((a, p) => a + price(p), 0);
    let guard = 300;
    while (spend() > budget + 1e-9 && guard-- > 0) {
      let swap = null;
      for (const p of xi) {
        if (locks.includes(p.fpl_id) || keep.includes(p.fpl_id)) continue;
        for (const q of byPos[p.position]) {
          if (chosen.has(q.fpl_id) || price(q) >= price(p)) continue;
          if (!roomAt(q) && q.team_id !== p.team_id) continue;
          const rate = (xp(p) - xp(q)) / (price(p) - price(q));
          if (!swap || rate < swap.rate) swap = { p, q, rate };
          break; // byPos is xP-sorted, so the first cheaper candidate is the best cheaper candidate
        }
      }
      if (!swap) break;
      xi[xi.indexOf(swap.p)] = swap.q;
      chosen.delete(swap.p.fpl_id); chosen.add(swap.q.fpl_id);
      unseat(swap.p); seat(swap.q);
    }
    if (spend() > budget + 1e-9) continue;

    /* UPGRADE PASS: while money remains, take the swap that buys the most xP per pound. Locked
       players are untouchable; kept players are fair game, because holding a 4.0 filler in the
       eleven while a better player sits affordable is the opposite of what the button is for. */
    let up = 300;
    while (up-- > 0) {
      const spare = budget - spend();
      let bestSwap = null;
      for (const out of xi) {
        if (locks.includes(out.fpl_id) || keep.includes(out.fpl_id)) continue;
        for (const inp of byPos[out.position]) {
          if (chosen.has(inp.fpl_id)) continue;
          const extra = price(inp) - price(out);
          if (extra > spare + 1e-9) continue;
          const gain = xp(inp) - xp(out);
          if (gain <= 1e-9) continue;
          if (!roomAt(inp) && inp.team_id !== out.team_id) continue;
          const rate = extra > 0 ? gain / extra : gain * 1000;   // free upgrades first
          if (!bestSwap || rate > bestSwap.rate) bestSwap = { out, inp, rate };
        }
      }
      if (!bestSwap) break;
      xi[xi.indexOf(bestSwap.out)] = bestSwap.inp;
      chosen.delete(bestSwap.out.fpl_id); chosen.add(bestSwap.inp.fpl_id);
      unseat(bestSwap.out); seat(bestSwap.inp);
    }

    /* SETTLE PASS: take the single legal swap with the biggest GAIN, until none is left.
     *
     * The pass above buys xP per pound, which is the right way to spend a budget but does not guarantee
     * that no single swap improves the eleven: a large gain at a large price can be affordable and still
     * be passed over for a better ratio. That left the Builder in a state where CHECKS could truthfully
     * report an upgrade immediately after the button had claimed to find the best eleven, which reads as
     * the tool contradicting itself. This runs the eleven to a point where no single legal swap helps. */
    let settle = 400;
    while (settle-- > 0) {
      const spare = budget - spend();
      let bestGain = null;
      /* The eleven first, because a point there is worth more than a point on the bench. */
      for (const out of xi) {
        if (locks.includes(out.fpl_id) || keep.includes(out.fpl_id)) continue;
        for (const inp of byPos[out.position]) {
          if (chosen.has(inp.fpl_id)) continue;
          if (price(inp) - price(out) > spare + 1e-9) continue;
          if (!roomAt(inp) && inp.team_id !== out.team_id) continue;
          const gain = xp(inp) - xp(out);
          if (gain <= 1e-9) continue;
          if (!bestGain || gain > bestGain.gain) bestGain = { out, inp, gain };
        }
      }
      /* Then the bench, so leftover budget is actually spent. A stronger bench is worth having anyway: it
         covers a late withdrawal and it is the whole squad under a bench boost. */
      if (!bestGain) {
        for (const out of bench) {
          if (locks.includes(out.fpl_id) || keep.includes(out.fpl_id)) continue;
          for (const inp of byPos[out.position]) {
            if (chosen.has(inp.fpl_id)) continue;
            if (price(inp) - price(out) > spare + 1e-9) continue;
            if (!roomAt(inp) && inp.team_id !== out.team_id) continue;
            const gain = xp(inp) - xp(out);
            if (gain <= 1e-9) continue;
            if (!bestGain || gain > bestGain.gain) bestGain = { out, inp, gain, onBench: true };
          }
        }
      }
      if (!bestGain) break;
      if (bestGain.onBench) {
        bench[bench.indexOf(bestGain.out)] = bestGain.inp;
      } else {
        xi[xi.indexOf(bestGain.out)] = bestGain.inp;
      }
      chosen.delete(bestGain.out.fpl_id); chosen.add(bestGain.inp.fpl_id);
      unseat(bestGain.out); seat(bestGain.inp);
    }

    // Hard check: nothing Louis picked may be missing from the final fifteen.
    const finalIds = new Set([...xi, ...bench].map((q) => q.fpl_id));
    if (keepList.some((k) => !finalIds.has(k.fpl_id))) continue;
    if (lockedList.some((k) => !xi.some((q) => q.fpl_id === k.fpl_id))) continue;

    const total = xi.reduce((a, p) => a + xp(p), 0);
    if (!best || total > best.xp) {
      best = {
        xi: xi.map((p) => ({ ...p, starting: true })),
        bench: bench.map((p) => ({ ...p, starting: false })),
        xp: Math.round(total * 10) / 10,
        cost: Math.round(spend() * 10) / 10,
        formation: `${d}-${m}-${f}`,
      };
    }
  }
  return best;
}


/* Improve a complete squad through legal, positive same-position swaps. Locks cannot leave, ignored
   players cannot enter, and every candidate is checked against the live bank and club limit after the
   outgoing player is removed. Repeating the best available gain spends useful budget without rebuilding
   the user's fifteen from scratch. */
export function improveSquad({ squad, pool, xpOf, locks = [], ignores = [], budget = 100, maxPerClub = 3 }) {
  const xp = (p) => Number.isFinite(Number(xpOf(p))) ? Number(xpOf(p)) : 0;
  const price = (p) => Number(p.price) || 0;
  const players = (squad.players || []).map((p) => ({ ...p }));
  const changes = [];
  let guard = 100;

  while (guard-- > 0) {
    const owned = new Set(players.map((p) => p.fpl_id));
    const spent = players.reduce((sum, p) => sum + price(p), 0);
    const clubs = new Map();
    for (const p of players) clubs.set(p.team_id, (clubs.get(p.team_id) || 0) + 1);
    let best = null;

    for (const outgoing of players) {
      if (locks.includes(outgoing.fpl_id)) continue;
      for (const incoming of pool || []) {
        if (incoming.position !== outgoing.position || owned.has(incoming.fpl_id) || ignores.includes(incoming.fpl_id)) continue;
        const nextSpend = spent - price(outgoing) + price(incoming);
        if (nextSpend > budget + 1e-9) continue;
        const nextClubCount = (clubs.get(incoming.team_id) || 0) + (incoming.team_id === outgoing.team_id ? 0 : 1);
        if (nextClubCount > maxPerClub) continue;
        const gain = xp(incoming) - xp(outgoing);
        if (gain <= 1e-9) continue;
        const extra = price(incoming) - price(outgoing);
        if (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) < 1e-9 && extra < best.extra)) {
          best = { outgoing, incoming, gain, extra };
        }
      }
    }

    if (!best) break;
    const index = players.findIndex((p) => p.fpl_id === best.outgoing.fpl_id);
    players[index] = { ...best.incoming, starting: Boolean(best.outgoing.starting) };
    changes.push({ out: best.outgoing.fpl_id, in: best.incoming.fpl_id, gain: best.gain });
  }

  return {
    ...squad,
    players,
    changes,
    spend: Math.round(players.reduce((sum, p) => sum + price(p), 0) * 10) / 10,
  };
}
