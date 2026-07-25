// B-02 · Layer 0 — market-implied team goals.
// Odds in, (lambda_home, lambda_away) out. Same code path for The Odds API and football-data.co.uk
// closing lines, so the backtest and the live run share one implementation exactly.
import { gridProbs } from "./dixon_coles.mjs";

/* Power-method de-overround: find k with sum((1/o_i)^k) = 1, bisection on k.
   Falls back to proportional normalisation if it cannot converge, and reports which ran. */
export function deoverround(odds, params) {
  const bounds = params.layer0.power_k_bounds.value;
  const tol = params.layer0.power_tolerance.value;
  const inv = odds.map((o) => 1 / o);
  const sumAt = (k) => inv.reduce((s, p) => s + Math.pow(p, k), 0);

  let lo = bounds[0], hi = bounds[1];
  if ((sumAt(lo) - 1) * (sumAt(hi) - 1) > 0) {
    const s = inv.reduce((a, b) => a + b, 0);
    return { probs: inv.map((p) => p / s), method: "proportional" };
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = sumAt(mid) - 1;
    if (Math.abs(f) < tol) { lo = hi = mid; break; }
    // sumAt is monotonically decreasing in k for inv < 1
    if (f > 0) lo = mid; else hi = mid;
  }
  const k = (lo + hi) / 2;
  const probs = inv.map((p) => Math.pow(p, k));
  const s = probs.reduce((a, b) => a + b, 0);
  if (!isFinite(s) || s <= 0) {
    const t = inv.reduce((a, b) => a + b, 0);
    return { probs: inv.map((p) => p / t), method: "proportional" };
  }
  return { probs: probs.map((p) => p / s), method: "power", k };
}

/* Two-outcome de-overround (over/under), always proportional — two-way books have no
   meaningful favourite-longshot structure to correct for. */
export function deoverroundTwo(a, b) {
  if (!a || !b) return null;
  const ia = 1 / a, ib = 1 / b;
  return ia / (ia + ib);
}

/* Solve (lambda_home, lambda_away) so the Dixon-Coles grid reproduces the market's
   {P(H), P(D), P(A), P(over 2.5)}. Coarse grid then local refine — deterministic, no optimiser
   dependency, and fast enough to run over three seasons of archive fixtures. */
export function solveLambdas(market, params) {
  const cfg = params.layer0.lambda_search.value;
  const w = params.layer0.weights.value;
  const rho = params.layer1.rho.value;
  const cap = params.layer1.grid_cap.value;

  const err = (lh, la) => {
    const g = gridProbs(lh, la, rho, cap);
    let e = w.h * (g.pH - market.pH) ** 2 + w.d * (g.pD - market.pD) ** 2 + w.a * (g.pA - market.pA) ** 2;
    if (market.pOver !== null && market.pOver !== undefined) e += w.over25 * (g.pOver25 - market.pOver) ** 2;
    return e;
  };

  const scan = (tMin, tMax, tStep, dMax, dStep, seed) => {
    let best = seed || { err: Infinity, lh: 1.4, la: 1.2 };
    for (let t = tMin; t <= tMax + 1e-9; t += tStep) {
      for (let d = -dMax; d <= dMax + 1e-9; d += dStep) {
        const lh = (t + d) / 2, la = (t - d) / 2;
        if (lh <= 0.05 || la <= 0.05) continue;
        const e = err(lh, la);
        if (e < best.err) best = { err: e, lh, la };
      }
    }
    return best;
  };

  const coarse = scan(cfg.total_min, cfg.total_max, cfg.coarse_step, cfg.diff_max, cfg.coarse_step);
  const t0 = coarse.lh + coarse.la, d0 = coarse.lh - coarse.la;
  const fine = scan(
    Math.max(0.2, t0 - cfg.coarse_step * 2), t0 + cfg.coarse_step * 2, cfg.refine_step,
    cfg.coarse_step * 2, cfg.refine_step, coarse
  );
  // the diff window in the refine pass is centred on d0, so re-scan around it explicitly
  let best = fine;
  for (let d = d0 - cfg.coarse_step * 2; d <= d0 + cfg.coarse_step * 2 + 1e-9; d += cfg.refine_step) {
    for (let t = Math.max(0.2, t0 - cfg.coarse_step * 2); t <= t0 + cfg.coarse_step * 2 + 1e-9; t += cfg.refine_step) {
      const lh = (t + d) / 2, la = (t - d) / 2;
      if (lh <= 0.05 || la <= 0.05) continue;
      const e = err(lh, la);
      if (e < best.err) best = { err: e, lh, la };
    }
  }

  const g = gridProbs(best.lh, best.la, rho, cap);
  return {
    lambda_home: +best.lh.toFixed(4),
    lambda_away: +best.la.toFixed(4),
    fit_residual: +Math.sqrt(best.err).toFixed(6),
    truncation_mass: +g.truncated.toFixed(8),
    converged: Math.sqrt(best.err) <= params.layer0.fit_residual_tolerance.value,
  };
}

/* Full Layer 0 for one odds row. */
export function impliedGoals(row, params) {
  if (!row.h || !row.d || !row.a) return null;
  const { probs, method } = deoverround([row.h, row.d, row.a], params);
  const pOver = deoverroundTwo(row.over25, row.under25);
  const market = { pH: probs[0], pD: probs[1], pA: probs[2], pOver };
  const fit = solveLambdas(market, params);
  return { ...fit, deoverround_method: method, market };
}
