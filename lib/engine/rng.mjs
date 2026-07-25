// Seeded, deterministic RNG + samplers. Every projection run is reproducible from its seed,
// which is stamped into model_versions alongside the git SHA (01 §4.8).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Deterministic seed from a string so a fixture always draws the same stream. */
export function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const bernoulli = (rng, p) => rng() < p;

/* Sample an index from a weight array (weights need not be normalised). */
export function categorical(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/* Knuth for small means, which is all we need (goals, cards, pens). */
export function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export function normal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Negative binomial via a gamma-Poisson mixture: counting stats (CBIT, recoveries, saves)
   are over-dispersed relative to Poisson, so the variance ratio is a fitted input. */
export function negBinomial(rng, mean, varianceRatio = 1.6) {
  if (mean <= 0) return 0;
  if (varianceRatio <= 1.0001) return poisson(rng, mean);
  const r = mean / (varianceRatio - 1);
  const gamma = gammaSample(rng, r) * (varianceRatio - 1);
  return poisson(rng, gamma);
}

/* Marsaglia-Tsang gamma sampler (shape >= 1 handled directly, shape < 1 by boosting). */
export function gammaSample(rng, shape) {
  if (shape <= 0) return 0;
  if (shape < 1) return gammaSample(rng, shape + 1) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 500; i++) {
    const x = normal(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return shape;
}

/* Order statistics of Uniform(0, fullTime) — goal minutes (01 §3.1 game-state trajectories). */
export function goalMinutes(rng, n, fullTime = 94) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(rng() * fullTime);
  return out.sort((a, b) => a - b);
}

export function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  const pos = (sortedArr.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (pos - lo);
}
