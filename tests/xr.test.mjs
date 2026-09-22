import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExactSquadForRange, XR_WINDOW, XR_B } from "../lib/server/exact-range-optimiser.mjs";
import { xrOf, XR_B as CLIENT_B } from "../lib/xr.mjs";
import D from "../config/external-xpts-2026-27.mjs";

/* xR = xPTS × (1 − ownership/100), optimised as a third solver pass within a fixed window of the best
   points total. These tests pin the two properties that matter most and cannot be checked by eye. */

const S = JSON.parse(readFileSync("tests/fpl-players.json", "utf8"));
const team = new Map(S.players.map((p) => [p.fpl_id, p.team_id]));
const ranked = [...D.rows].sort((a, b) => (b.xpts[5] || 0) - (a.xpts[5] || 0));
const own = new Map(ranked.map((r, i) => [r.fpl_id, Math.max(0.3, 75 * Math.exp(-i / 25))]));
const pool = D.rows.filter((r) => r.price > 0).map((r) => ({
  fpl_id: r.fpl_id, web_name: r.name, position: r.position, price: r.price,
  team_id: team.get(r.fpl_id) || 0, team: r.club, xp: r.xpts, own: own.get(r.fpl_id),
}));
const scoreForGw = (p, gw) => Number(p.xp[gw - 1]) || 0;
const ownershipOf = (p) => p.own;

test("the dials are fixed constants, and the solver and the screens agree on b", () => {
  assert.equal(XR_WINDOW, 0.04);
  assert.equal(XR_B, 0.5);
  assert.equal(CLIENT_B, XR_B, "one b, or a card and the solver would disagree about the same player");
});

test("the formula matches the worked examples", () => {
  assert.equal(Math.round(xrOf(43.18, 73.6) * 100) / 100, 27.29);
  assert.equal(Math.round(xrOf(39.02, 13.4) * 100) / 100, 36.41);
  assert.equal(Math.round(xrOf(28.38, 0.7) * 100) / 100, 28.28);
  assert.equal(xrOf(10, null, 20), xrOf(10, 20), "unknown ownership takes the fallback, never zero");
});

test("a player the line-up gate zeroes has zero xR and cannot be picked under either objective", async () => {
  /* Zero the best player in the pool, as the gate would for someone left out of his club's eleven. */
  const best = ranked[0];
  const gated = pool.map((p) => (p.fpl_id === best.fpl_id ? { ...p, xp: p.xp.map(() => 0) } : p));
  const common = { pool: gated, scoreForGw, gwFrom: 6, gwTo: 7, budget: 100, benchBudget: 16.5, ownershipOf };
  const [plain, differentiated] = await Promise.all([
    buildExactSquadForRange({ ...common, xr: false }),
    buildExactSquadForRange({ ...common, xr: true }),
  ]);
  assert.ok(plain.ok && differentiated.ok, plain.error || differentiated.error);
  for (const result of [plain, differentiated]) {
    const ids = [...result.xi, ...result.bench].map((p) => Number(p.fpl_id));
    assert.ok(!ids.includes(Number(best.fpl_id)), "a zeroed player is worth nothing and is not chosen");
  }
});

test("pass two never returns a squad below the floor, and the floor binding returns pass one's squad", async () => {
  const common = { pool, scoreForGw, gwFrom: 6, gwTo: 7, budget: 100, benchBudget: 16.5, ownershipOf };
  const plain = await buildExactSquadForRange({ ...common, xr: false });
  const differentiated = await buildExactSquadForRange({ ...common, xr: true });
  assert.ok(plain.ok && differentiated.ok, plain.error || differentiated.error);
  assert.equal(differentiated.xr_applied, true);
  assert.equal(differentiated.xr_budget, Math.round(XR_WINDOW * 11 * 2 * 100) / 100);
  /* The hard property: what came back sits inside the window. */
  assert.ok(differentiated.xpts_given_up <= differentiated.xr_budget + 1e-9,
    `gave up ${differentiated.xpts_given_up} against a budget of ${differentiated.xr_budget}`);
  /* Both sides are reported at two decimals, so a floor met exactly can read as missed by 0.005. The
     solver enforces the floor exactly in its own integer units and rejects anything under it; this
     checks the report agrees to display precision. */
  assert.ok(differentiated.xpts_achieved >= plain.xp - differentiated.xr_budget - 0.011);
  /* With everyone owned identically, xR is a constant multiple of xPTS, so the floor binds exactly and
     pass two must hand back pass one's squad. That is correct behaviour, not a bug. */
  const flat = pool.map((p) => ({ ...p, own: 20 }));
  const same = await buildExactSquadForRange({ ...common, pool: flat, xr: true });
  assert.ok(same.ok, same.error);
  assert.equal(same.xpts_given_up, 0, "identical ownership leaves nothing to trade, so nothing is given up");
});

test("both solver routes pass xr and ownership through to the solver", () => {
  /* The exact-squad route parsed `xr` from the body and then called the solver without it, so the toggle
     changed what the pitch displayed and nothing about what was built. A flag that is read and not
     passed is invisible to every other test, because the response is still a valid squad. */
  for (const file of ["app/api/exact-squad/route.js", "app/api/optimise/route.js"]) {
    const src = readFileSync(file, "utf8");
    const call = src.slice(src.indexOf("buildExactSquadForRange({"));
    assert.match(call, /\n\s+xr(: xrRequested)?,\n/, `${file} passes xr into the solver call`);
    assert.match(call, /ownershipOf: \(player\) =>/, `${file} passes ownership into the solver call`);
  }
});
