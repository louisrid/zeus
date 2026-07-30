// Real-team XI sampler. FPL squad-position rules are not football formation rules.
// In particular, no FPL-classified forward is ever forced into the XI.

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function reconcileProbabilities(items, target, ceiling = 0.995) {
  const out = items.map((item) => ({ item, p: Math.min(ceiling, clamp01(item.p_start)) }));
  if (!out.length) return out;
  target = Math.max(0, Math.min(target, out.length));
  for (let pass = 0; pass < 20; pass++) {
    const sum = out.reduce((s, x) => s + x.p, 0);
    if (Math.abs(sum - target) < 1e-10) break;
    if (sum < target) {
      const room = out.reduce((s, x) => s + (ceiling - x.p), 0);
      if (room <= 1e-12) break;
      for (const x of out) x.p += (target - sum) * (ceiling - x.p) / room;
    } else {
      if (sum <= 1e-12) break;
      for (const x of out) x.p -= (sum - target) * x.p / sum;
    }
    for (const x of out) x.p = Math.max(0, Math.min(ceiling, x.p));
  }
  return out;
}

/**
 * Dependent rounding preserves the exact selected count while keeping each
 * player's marginal selection probability close to the reconciled p_start.
 */
export function dependentRound(items, count, rng) {
  if (count <= 0 || !items.length) return [];
  if (count >= items.length) return [...items];
  const work = reconcileProbabilities(items, count);
  const eps = 1e-10;
  for (let guard = 0; guard < 10000; guard++) {
    const fractional = work.filter((x) => x.p > eps && x.p < 1 - eps);
    if (fractional.length < 2) break;
    const a = fractional[0];
    const b = fractional[1];
    const up = Math.min(1 - a.p, b.p);
    const down = Math.min(a.p, 1 - b.p);
    if (up + down <= eps) break;
    if (rng() < down / (up + down)) {
      a.p += up;
      b.p -= up;
    } else {
      a.p -= down;
      b.p += down;
    }
  }

  const selected = work.filter((x) => x.p >= 1 - eps).map((x) => x.item);
  if (selected.length === count) return selected;
  const selectedIds = new Set(selected.map((p) => p.player_id));
  const remainder = work
    .filter((x) => !selectedIds.has(x.item.player_id))
    .sort((a, b) => b.p - a.p || String(a.item.player_id).localeCompare(String(b.item.player_id)));
  return selected.concat(remainder.slice(0, count - selected.length).map((x) => x.item));
}

function stochasticRound(value, rng) {
  const floor = Math.floor(value);
  return floor + (rng() < value - floor ? 1 : 0);
}

export function sampleRealXI(players, rng) {
  const gks = players.filter((p) => p.position === "GKP");
  const defs = players.filter((p) => p.position === "DEF");
  const attackers = players.filter((p) => p.position === "MID" || p.position === "FWD");
  const other = players.filter((p) => !["GKP", "DEF", "MID", "FWD"].includes(p.position));

  const goalkeeper = dependentRound(gks, Math.min(1, gks.length), rng);
  const expectedDefs = defs.reduce((sum, p) => sum + clamp01(p.p_start), 0);
  let defenderCount = Math.max(3, Math.min(5, stochasticRound(expectedDefs, rng)));
  defenderCount = Math.min(defenderCount, defs.length, Math.max(0, 10));
  const defenders = dependentRound(defs, defenderCount, rng);
  const outfieldSlots = Math.max(0, 10 - defenders.length);
  let outfield = dependentRound(attackers, Math.min(outfieldSlots, attackers.length), rng);

  let xi = [...goalkeeper, ...defenders, ...outfield];
  if (xi.length < 11) {
    const selected = new Set(xi.map((p) => p.player_id));
    const remaining = [...defs, ...attackers, ...other, ...gks].filter((p) => !selected.has(p.player_id));
    xi = xi.concat(dependentRound(remaining, Math.min(11 - xi.length, remaining.length), rng));
  }
  return xi.slice(0, 11);
}

function scaleGroup(group, target, ceiling) {
  if (!group.length) return;
  const reconciled = reconcileProbabilities(group, target, ceiling);
  for (const { item, p } of reconciled) item.p_start = p;
}

export function normaliseRealStarts(players, cfg = {}) {
  const ceiling = Number(cfg.pStartCeiling) || 0.995;
  const eligible = players.filter((p) => Number.isFinite(Number(p.p_start)));
  const hasPositions = eligible.length > 0 && eligible.every((p) => ["GKP", "DEF", "MID", "FWD"].includes(p.position));
  if (hasPositions) {
    const gks = eligible.filter((p) => p.position === "GKP");
    const outfield = eligible.filter((p) => p.position !== "GKP");
    if (gks.length) scaleGroup(gks, 1, ceiling);
    if (outfield.length >= 10) scaleGroup(outfield, 10, ceiling);
  } else if (eligible.length >= 11) {
    scaleGroup(eligible, 11, ceiling);
  }

  for (const p of players) {
    if (!Number.isFinite(Number(p.p_start))) continue;
    p.p_start = clamp01(p.p_start);
    p.p_cameo = Math.max(0, Math.min(1 - p.p_start, Number(p.p_cameo) || 0));
    p.p60 = p.p_start * (Number(p.p60_given_start) || 0)
      + p.p_cameo * (Number(cfg.earlySubShare) || 0);
  }
  return players;
}
