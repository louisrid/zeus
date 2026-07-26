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

export function bestXI({ pool, xpOf, locks = [], budget = 100, maxPerClub = 3 }) {
  const price = (p) => Number(p.price);
  const xp = (p) => { const v = xpOf(p); return Number.isFinite(Number(v)) ? Number(v) : 0; };
  const cand = (pool || []).filter((p) => Number.isFinite(price(p)) && price(p) > 0);
  if (cand.length < 15) return null;
  const lockedList = cand.filter((p) => locks.includes(p.fpl_id));
  const byPos = {};
  for (const pos of Object.keys(QUOTAS)) {
    byPos[pos] = cand.filter((p) => p.position === pos).sort((a, b) => xp(b) - xp(a) || price(a) - price(b));
  }

  let best = null;
  for (const [d, m, f] of FORMATIONS) {
    const need = { GKP: 1, DEF: d, MID: m, FWD: f };
    // Locks must fit the formation, or this formation is out.
    const lockCount = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of lockedList) lockCount[p.position]++;
    if (Object.keys(need).some((pos) => lockCount[pos] > need[pos])) continue;

    const club = new Map();
    const seat = (p) => club.set(p.team_id, (club.get(p.team_id) || 0) + 1);
    const unseat = (p) => club.set(p.team_id, club.get(p.team_id) - 1);
    const roomAt = (p) => (club.get(p.team_id) || 0) < maxPerClub;

    const xi = [...lockedList];
    const chosen = new Set(xi.map((p) => p.fpl_id));
    xi.forEach(seat);

    let feasible = true;
    for (const pos of Object.keys(need)) {
      let slots = need[pos] - xi.filter((p) => p.position === pos).length;
      for (const p of byPos[pos]) {
        if (slots <= 0) break;
        if (chosen.has(p.fpl_id) || !roomAt(p)) continue;
        xi.push(p); chosen.add(p.fpl_id); seat(p); slots--;
      }
      if (slots > 0) { feasible = false; break; }
    }
    if (!feasible) continue;

    // Bench: the cheapest legal bodies that complete the fifteen's quotas.
    const bench = [];
    for (const pos of Object.keys(QUOTAS)) {
      let slots = QUOTAS[pos] - need[pos];
      const cheap = byPos[pos].slice().sort((a, b) => price(a) - price(b));
      for (const p of cheap) {
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
        if (locks.includes(p.fpl_id)) continue;
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

    const total = xi.reduce((a, p) => a + xp(p), 0);
    if (!best || total > best.xp) {
      best = {
        xi: [...xi], bench: [...bench],
        xp: Math.round(total * 10) / 10,
        cost: Math.round(spend() * 10) / 10,
        formation: `${d}-${m}-${f}`,
      };
    }
  }
  return best;
}
