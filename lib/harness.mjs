/* WALK-FORWARD HARNESS — DECISIONS 9.3.
 *
 * Every model job here does the same thing: sort by gameweek, predict using only what was known
 * before it, then update. Writing that loop four times invited four subtly different versions of it,
 * so it lives here once.
 *
 * The rule the harness enforces is the one that makes a test a test: at gameweek t, a model may see
 * gameweeks strictly before t and nothing else. There is no way to pass future data into a predictor
 * through this interface, which is the point.
 *
 * Pure: no database, no clock, no config. Fully testable.
 */

/* Run a walk-forward evaluation.
 *
 *   rows      any objects carrying a gameweek, in any order
 *   gwOf      how to read the gameweek from a row
 *   models    { name: (row, state) => number|null }  a null prediction skips that row for that model
 *   update    (state, row) => void   applied AFTER every model has predicted that gameweek
 *   initial   () => state
 *   actualOf  (row) => number
 *
 * Returns per-model error totals plus the per-gameweek prediction sets, which is what a ranking
 * metric needs.
 */
export function walkForward({ rows, gwOf, models, update, initial, actualOf }) {
  const state = initial ? initial() : {};
  const names = Object.keys(models);
  const errs = {};
  for (const n of names) errs[n] = { n: 0, abs: 0, sq: 0 };
  const perGw = new Map();

  // Group by gameweek so every model predicts a gameweek before any of it is revealed.
  const byGw = new Map();
  for (const r of rows) {
    const gw = gwOf(r);
    const list = byGw.get(gw) || [];
    list.push(r);
    byGw.set(gw, list);
  }

  for (const gw of [...byGw.keys()].sort((a, b) => a - b)) {
    const batch = byGw.get(gw);
    const sets = { actual: [] };
    for (const n of names) sets[n] = [];

    for (const row of batch) {
      const actual = Number(actualOf(row));
      const preds = {};
      let anyPrediction = false;
      for (const n of names) {
        const p = models[n](row, state);
        preds[n] = p;
        if (p !== null && p !== undefined && Number.isFinite(Number(p))) anyPrediction = true;
      }
      // Only score rows every model could predict, so the comparison is like for like.
      const allPredicted = names.every((n) => preds[n] !== null && preds[n] !== undefined && Number.isFinite(Number(preds[n])));
      if (anyPrediction && allPredicted) {
        sets.actual.push(actual);
        for (const n of names) {
          const e = Number(preds[n]) - actual;
          errs[n].n += 1; errs[n].abs += Math.abs(e); errs[n].sq += e * e;
          sets[n].push(Number(preds[n]));
        }
      }
    }
    if (sets.actual.length) perGw.set(gw, sets);
    // Reveal the gameweek only now.
    if (update) for (const row of batch) update(state, row);
  }

  const summary = {};
  for (const n of names) {
    const e = errs[n];
    summary[n] = { n: e.n, mae: e.n ? e.abs / e.n : null, rmse: e.n ? Math.sqrt(e.sq / e.n) : null };
  }
  return { summary, perGw };
}

function ranksOf(xs) {
  const order = xs.map((v, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a, b) {
  if (a.length < 3) return null;
  const ra = ranksOf(a), rb = ranksOf(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/* Mean rank correlation across gameweeks, per model. This is the verdict metric: FPL points are
   skewed enough that a constant near the median wins average error while ordering nobody. */
export function rankingByModel(perGw) {
  const acc = {};
  for (const [, sets] of perGw) {
    for (const name of Object.keys(sets)) {
      if (name === "actual") continue;
      const s = spearman(sets[name], sets.actual);
      if (s === null || Number.isNaN(s)) continue;
      const a = acc[name] || { sum: 0, n: 0 };
      a.sum += s; a.n += 1; acc[name] = a;
    }
  }
  const out = {};
  for (const [name, a] of Object.entries(acc)) out[name] = a.n ? a.sum / a.n : null;
  return out;
}

/* Verdict: a model passes only if it ranks better than every baseline. */
export function verdict(ranking, modelName) {
  const mine = ranking[modelName];
  if (mine === null || mine === undefined) return { passes: false, best: null, reason: "no ranking could be computed" };
  let best = null;
  for (const [name, v] of Object.entries(ranking)) {
    if (name === modelName || v === null || v === undefined) continue;
    if (best === null || v > best.value) best = { name, value: v };
  }
  if (!best) return { passes: false, best: null, reason: "no baseline to compare against" };
  return { passes: mine > best.value, best, reason: `${modelName} ${mine.toFixed(4)} against ${best.name} ${best.value.toFixed(4)}` };
}
