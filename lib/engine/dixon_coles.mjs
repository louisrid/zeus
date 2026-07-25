// B-03 · Layer 1 — Dixon-Coles joint scoreline model.
// P(x,y) = tau(x,y) * Pois(x; lh) * Pois(y; la), tau applying the low-score correction to
// (0,0) (1,0) (0,1) (1,1) via rho. Everything downstream draws from this one grid.

const LOG_FACT = (() => {
  const a = [0];
  for (let i = 1; i <= 40; i++) a[i] = a[i - 1] + Math.log(i);
  return a;
})();

export function pois(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - LOG_FACT[k]);
}

export function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/* Full normalised scoreline grid. Returned as a flat array of rows for cheap sampling. */
export function scorelineGrid(lh, la, rho, cap = 10) {
  const grid = [];
  let mass = 0;          // total after tau, before renormalisation
  let poissonMass = 0;   // independent-Poisson mass inside the grid
  for (let x = 0; x <= cap; x++) {
    const row = [];
    for (let y = 0; y <= cap; y++) {
      const base = pois(x, lh) * pois(y, la);
      const p = Math.max(0, tau(x, y, lh, la, rho) * base);
      row.push(p);
      mass += p;
      poissonMass += base;
    }
    grid.push(row);
  }
  for (let x = 0; x <= cap; x++) for (let y = 0; y <= cap; y++) grid[x][y] /= mass;
  return {
    grid, mass,
    truncated: Math.max(0, 1 - poissonMass),   // probability mass beyond the grid edge
    tauDistortion: Math.abs(1 - mass),         // mass the low-score correction added or removed
  };
}

/* Match-level probabilities the market is fitted against. */
export function gridProbs(lh, la, rho, cap = 10) {
  const { grid, truncated } = scorelineGrid(lh, la, rho, cap);
  let pH = 0, pD = 0, pA = 0, pOver25 = 0, csHome = 0, csAway = 0;
  for (let x = 0; x <= cap; x++) {
    for (let y = 0; y <= cap; y++) {
      const p = grid[x][y];
      if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
      if (x + y > 2.5) pOver25 += p;
      if (y === 0) csHome += p;
      if (x === 0) csAway += p;
    }
  }
  return { pH, pD, pA, pOver25, csHome, csAway, truncated };
}

/* Flattened cumulative distribution for O(log n) sampling inside the simulator. */
export function makeSampler(lh, la, rho, cap = 10) {
  const { grid } = scorelineGrid(lh, la, rho, cap);
  const cum = [];
  const pairs = [];
  let acc = 0;
  for (let x = 0; x <= cap; x++) {
    for (let y = 0; y <= cap; y++) {
      acc += grid[x][y];
      cum.push(acc);
      pairs.push([x, y]);
    }
  }
  return function sample(rand) {
    const u = rand() * acc;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < u) lo = mid + 1; else hi = mid;
    }
    return pairs[lo];
  };
}

/* Goal minutes as order statistics of U(0, matchMinutes). Feeds game-state shares:
   how long each side spent leading, level and trailing. */
export function goalMinutes(n, matchMinutes, rand) {
  const m = [];
  for (let i = 0; i < n; i++) m.push(rand() * matchMinutes);
  return m.sort((a, b) => a - b);
}

export function gameStateShares(homeGoalMins, awayGoalMins, matchMinutes) {
  const events = [
    ...homeGoalMins.map((t) => ({ t, side: "h" })),
    ...awayGoalMins.map((t) => ({ t, side: "a" })),
  ].sort((p, q) => p.t - q.t);
  const home = { leading: 0, level: 0, trailing: 0 };
  const away = { leading: 0, level: 0, trailing: 0 };
  let diff = 0, last = 0;
  const bucket = (d) => (d > 0 ? "leading" : d < 0 ? "trailing" : "level");
  const mirror = (d) => (d > 0 ? "trailing" : d < 0 ? "leading" : "level");
  for (const e of events) {
    const span = e.t - last;
    home[bucket(diff)] += span;
    away[mirror(diff)] += span;
    diff += e.side === "h" ? 1 : -1;
    last = e.t;
  }
  const span = matchMinutes - last;
  home[bucket(diff)] += span;
  away[mirror(diff)] += span;
  const norm = (o) => ({ leading: o.leading / matchMinutes, level: o.level / matchMinutes, trailing: o.trailing / matchMinutes });
  return { home: norm(home), away: norm(away) };
}

/* Maximum-likelihood rho over historical fixtures, each carrying its own odds-implied means.
   Coarse line search: rho is one scalar, the archive is a few thousand matches, and a
   deterministic search is reproducible run to run. */
export function fitRho(matches, cap = 10, lo = -0.25, hi = 0.05, step = 0.005) {
  let best = { rho: 0, ll: -Infinity };
  for (let r = lo; r <= hi + 1e-9; r += step) {
    let ll = 0;
    for (const m of matches) {
      const { grid } = scorelineGrid(m.lh, m.la, r, cap);
      const x = Math.min(cap, m.home_goals), y = Math.min(cap, m.away_goals);
      const p = grid[x][y];
      ll += Math.log(p > 0 ? p : 1e-12);
    }
    if (ll > best.ll) best = { rho: +r.toFixed(4), ll };
  }
  return best;
}
