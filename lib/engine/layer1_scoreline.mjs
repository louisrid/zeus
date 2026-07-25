// Layer 1 · Dixon-Coles joint scoreline model (01 §3.1).
// P(x,y) = tau(x,y) * Pois(x; lh) * Pois(y; la), tau applying the low-score correction via rho.
// rho is a calibrated parameter: it is read from the engine config, never hard-coded at a call site.

export const GRID_CAP = 10;

const LOG_FACT = (() => {
  const out = [0];
  for (let i = 1; i <= GRID_CAP + 1; i++) out[i] = out[i - 1] + Math.log(i);
  return out;
})();

export const poisPmf = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - LOG_FACT[k]);
};

export function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/* Full joint scoreline distribution. Returns the normalised grid plus the truncation mass
   discarded beyond the cap, which the calibration harness records (01 §3.1). */
export function scorelineGrid(lh, la, rho, cap = GRID_CAP) {
  const grid = [];
  let total = 0;
  for (let x = 0; x <= cap; x++) {
    grid[x] = [];
    for (let y = 0; y <= cap; y++) {
      const p = Math.max(0, tau(x, y, lh, la, rho) * poisPmf(x, lh) * poisPmf(y, la));
      grid[x][y] = p;
      total += p;
    }
  }
  const truncation = Math.max(0, 1 - total);
  if (total > 0) {
    for (let x = 0; x <= cap; x++) for (let y = 0; y <= cap; y++) grid[x][y] /= total;
  }
  return { grid, cap, truncation };
}

/* Market-facing summaries of the grid: the four quantities Layer 0 fits against. */
export function gridMarkets(grid, cap = GRID_CAP) {
  let pH = 0;
  let pD = 0;
  let pA = 0;
  let over25 = 0;
  for (let x = 0; x <= cap; x++) {
    for (let y = 0; y <= cap; y++) {
      const p = grid[x][y];
      if (x > y) pH += p;
      else if (x === y) pD += p;
      else pA += p;
      if (x + y > 2.5) over25 += p;
    }
  }
  return { pH, pD, pA, over25 };
}

/* Clean sheets and the conceded distribution that drives the -1-per-2 term. */
export function defensiveOutcomes(grid, cap = GRID_CAP) {
  const concededHome = new Array(cap + 1).fill(0); // goals conceded by the home team = away goals
  const concededAway = new Array(cap + 1).fill(0);
  for (let x = 0; x <= cap; x++) {
    for (let y = 0; y <= cap; y++) {
      concededHome[y] += grid[x][y];
      concededAway[x] += grid[x][y];
    }
  }
  return {
    pCsHome: concededHome[0],
    pCsAway: concededAway[0],
    concededHome,
    concededAway,
  };
}

/* Sample a scoreline from the grid with a supplied uniform draw. */
export function sampleScoreline(grid, u, cap = GRID_CAP) {
  let acc = 0;
  for (let x = 0; x <= cap; x++) {
    for (let y = 0; y <= cap; y++) {
      acc += grid[x][y];
      if (u <= acc) return [x, y];
    }
  }
  return [0, 0];
}

/* Time-share of each game state for one side, from goal minutes (01 §3.1).
   Returns fractions of the match spent leading / level / trailing. */
export function gameStateShares(homeGoalMinutes, awayGoalMinutes, fullTime = 94) {
  const events = [
    ...homeGoalMinutes.map((m) => ({ m, side: 1 })),
    ...awayGoalMinutes.map((m) => ({ m, side: -1 })),
  ].sort((a, b) => a.m - b.m);
  let diff = 0;
  let last = 0;
  const home = { leading: 0, level: 0, trailing: 0 };
  const push = (from, to, d) => {
    const span = Math.max(0, to - from);
    if (d > 0) home.leading += span;
    else if (d === 0) home.level += span;
    else home.trailing += span;
  };
  for (const e of events) {
    push(last, e.m, diff);
    diff += e.side;
    last = e.m;
  }
  push(last, fullTime, diff);
  const norm = (v) => v / fullTime;
  return {
    home: { leading: norm(home.leading), level: norm(home.level), trailing: norm(home.trailing) },
    away: { leading: norm(home.trailing), level: norm(home.level), trailing: norm(home.leading) },
  };
}
