import test from "node:test";
import assert from "node:assert/strict";
import { walkForward, spearman, rankingByModel, verdict } from "../lib/harness.mjs";

// Four players per gameweek: a rank correlation needs at least three points to exist.
const rows = [
  { gw: 1, id: "a", actual: 2 }, { gw: 1, id: "b", actual: 8 }, { gw: 1, id: "c", actual: 5 }, { gw: 1, id: "d", actual: 1 },
  { gw: 2, id: "a", actual: 3 }, { gw: 2, id: "b", actual: 7 }, { gw: 2, id: "c", actual: 4 }, { gw: 2, id: "d", actual: 0 },
  { gw: 3, id: "a", actual: 1 }, { gw: 3, id: "b", actual: 9 }, { gw: 3, id: "c", actual: 6 }, { gw: 3, id: "d", actual: 2 },
];

test("a model cannot see the gameweek it is predicting (9.3)", () => {
  const seen = [];
  walkForward({
    rows, gwOf: (r) => r.gw, actualOf: (r) => r.actual,
    initial: () => ({ revealed: [] }),
    update: (s, r) => s.revealed.push(r.gw),
    models: { m: (r, s) => { seen.push({ predicting: r.gw, knows: [...new Set(s.revealed)] }); return 5; } },
  });
  for (const { predicting, knows } of seen) {
    assert.ok(!knows.includes(predicting), `predicting GW${predicting} while knowing ${knows.join(",")}`);
    for (const k of knows) assert.ok(k < predicting, "only earlier gameweeks may be known");
  }
});

test("state updates only after the whole gameweek has been predicted", () => {
  const order = [];
  walkForward({
    rows, gwOf: (r) => r.gw, actualOf: (r) => r.actual,
    initial: () => ({}),
    update: () => order.push("update"),
    models: { m: () => { order.push("predict"); return 1; } },
  });
  // gw1: predict, predict, update, update. Never update before both predictions of that gameweek.
  assert.deepEqual(order.slice(0, 8), ["predict", "predict", "predict", "predict", "update", "update", "update", "update"]);
});

test("a row only counts when every model could predict it, so comparison is like for like", () => {
  const { summary } = walkForward({
    rows, gwOf: (r) => r.gw, actualOf: (r) => r.actual,
    initial: () => ({}),
    models: {
      always: () => 5,
      sometimes: (r) => (r.id === "a" ? 5 : null),
    },
  });
  assert.equal(summary.always.n, summary.sometimes.n, "both models must be scored on the same rows");
  assert.equal(summary.always.n, 3, "only the three rows the picky model could predict");
  assert.equal(summary.sometimes.n, 3);
});

test("ranking is measured per gameweek and averaged", () => {
  const { perGw } = walkForward({
    rows, gwOf: (r) => r.gw, actualOf: (r) => r.actual,
    initial: () => ({}),
    models: { good: (r) => r.actual, bad: (r) => -r.actual },
  });
  const ranking = rankingByModel(perGw);
  assert.ok(ranking.good > 0.9, `a perfect model should rank near 1, got ${ranking.good}`);
  assert.ok(ranking.bad < -0.9, `an inverted model should rank near -1, got ${ranking.bad}`);
});

test("the verdict passes only when the model beats every baseline", () => {
  assert.equal(verdict({ mine: 0.5, base: 0.4 }, "mine").passes, true);
  assert.equal(verdict({ mine: 0.3, base: 0.4 }, "mine").passes, false);
  assert.equal(verdict({ mine: 0.5, a: 0.4, b: 0.6 }, "mine").passes, false, "must beat the best, not just one");
  assert.equal(verdict({ mine: null }, "mine").passes, false);
  assert.equal(verdict({ mine: 0.5 }, "mine").passes, false, "no baseline means no pass");
});

test("spearman handles ties and refuses tiny samples", () => {
  assert.equal(spearman([1, 2], [1, 2]), null, "fewer than three points is not a correlation");
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null, "no variance means no correlation");
  assert.ok(Math.abs(spearman([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});
