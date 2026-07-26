// Solver suite. Exercises lib/solver/core.mjs, which is the exact code the browser runs
// through the thin bindings in squad.js and evaluate.js.
import test from "node:test";
import assert from "node:assert/strict";
import SCHEDULE from "../config/schedule.js";
import { readFileSync } from "fs";
import { limitsFrom, makeOps, makeEval } from "../lib/solver/core.mjs";
import { metricName, metricLabel, interimChip, availabilityMult, fixtureMult, buildScorer, UPGRADES } from "../lib/solver/score.mjs";

const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));
const R = limitsFrom(rules);
const ops = makeOps(R);
const ev = makeEval(R, ops);

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

/* A synthetic pool: twenty clubs, deep enough at every position to fill a squad many ways. */
function pool() {
  const out = [];
  let id = 1;
  for (let club = 1; club <= 20; club++) {
    for (const [pos, n, base] of [["GKP", 3, 4.5], ["DEF", 6, 4.0], ["MID", 7, 4.5], ["FWD", 4, 4.5]]) {
      for (let i = 0; i < n; i++) {
        const price = +(base + i * 1.2).toFixed(1);
        out.push({
          fpl_id: id, id, team_id: club, team: `T${club}`, position: pos,
          web_name: `${pos}${club}-${i}`, price, status: "a", chance_of_playing: null,
          own: 5 + (i * 3) % 40,
          // Score rises with price and with club index, so ranking is unambiguous.
          _score: +(price * 0.55 + club * 0.02).toFixed(3),
        });
        id++;
      }
    }
  }
  return out;
}

const P = pool();
const scoreOf = (p) => p._score ?? 0;
const bandOf = (p) => ({ p10: scoreOf(p) * 0.4, p50: scoreOf(p), p90: scoreOf(p) * 1.8, real: false });
const ctx = {
  scoreOf, bandOf,
  tailOf: () => null,
  floorOf: (p) => bandOf(p).p10,
  minutes: new Map(),
  perGw: new Map(),
};
const find = (pos, i = 0) => P.filter((p) => p.position === pos)[i];

/* ── limits come from the ruleset ─────────────────────────────────────── */

test("limits are read from the ruleset, not hard-coded", () => {
  assert.equal(R.size, 15);
  assert.deepEqual(R.composition, { GKP: 2, DEF: 5, MID: 5, FWD: 3 });
  assert.equal(R.budget, 100);
  assert.equal(R.maxPerClub, 3);
  assert.equal(R.startingXI, 11);
  assert.equal(R.hitCost, -4);
});

test("every legal shape is derived from the formation minimums", () => {
  // Derived from the ruleset rather than a typed list. This yields eight shapes, not the seven
  // enumerated in 03 §3.2: 5-2-3 is legal under the stated minimums and is included.
  const keys = ops.STRUCTURES.map((s) => s.key).sort();
  assert.deepEqual(keys, ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1"]);
  for (const s of ops.STRUCTURES) {
    assert.equal(s.DEF + s.MID + s.FWD + s.GKP, R.startingXI);
    assert.ok(s.DEF >= R.formation.DEF_min && s.MID >= R.formation.MID_min && s.FWD >= R.formation.FWD_min);
  }
});

/* ── legality ─────────────────────────────────────────────────────────── */

test("an empty squad starts with the full budget", () => {
  const s = ops.emptySquad("3-5-2");
  assert.equal(ops.bank(s), 100);
  assert.equal(ops.spend(s), 0);
  assert.equal(s.structure, "3-5-2");
});

test("an unknown structure key falls back rather than breaking the pitch", () => {
  assert.equal(ops.emptySquad("9-9-9").structure, ops.STRUCTURES[0].key);
});

test("the same player cannot be added twice", () => {
  let s = ops.emptySquad("3-5-2");
  const p = find("MID");
  s = ops.addPlayer(s, p);
  const check = ops.canAdd(s, p);
  assert.equal(check.ok, false);
  assert.match(check.reason, /already in this squad/);
});

test("the club limit is enforced with a plain-language reason", () => {
  let s = ops.emptySquad("3-5-2");
  const club = P.filter((p) => p.team_id === 4 && p.position !== "GKP").slice(0, 3);
  for (const p of club) s = ops.addPlayer(s, p);
  const fourth = P.find((p) => p.team_id === 4 && !club.includes(p));
  const check = ops.canAdd(s, fourth);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Three from/);
});

test("position quotas are enforced", () => {
  let s = ops.emptySquad("3-5-2");
  const gks = P.filter((p) => p.position === "GKP" && p.team_id <= 2).slice(0, 2);
  for (const p of gks) s = ops.addPlayer(s, p);
  const third = P.find((p) => p.position === "GKP" && !gks.includes(p));
  assert.equal(ops.canAdd(s, third).ok, false);
});

test("a player over the remaining bank is refused", () => {
  let s = ops.emptySquad("3-5-2");
  const expensive = [...P].sort((a, b) => b.price - a.price).slice(0, 9);
  for (const p of expensive) {
    const c = ops.canAdd(s, p);
    if (c.ok) s = ops.addPlayer(s, p);
  }
  assert.ok(ops.bank(s) >= 0, `bank went negative: ${ops.bank(s)}`);
});

test("removing a player clears the armband if he held it", () => {
  let s = ops.emptySquad("3-5-2");
  const p = find("FWD");
  s = ops.addPlayer(s, p);
  s = { ...s, captain: p.fpl_id, vice: p.fpl_id };
  s = ops.removePlayer(s, p.fpl_id);
  assert.equal(s.captain, null);
  assert.equal(s.vice, null);
  assert.equal(s.players.length, 0);
});

/* ── the eleven and the bench ─────────────────────────────────────────── */

test("the first players in fill the eleven, extras drop to the bench", () => {
  let s = ops.emptySquad("3-4-3");
  const defs = P.filter((p) => p.position === "DEF" && p.team_id % 3 === 0).slice(0, 5);
  for (const p of defs) s = ops.addPlayer(s, p);
  assert.equal(ops.countPos(s, "DEF"), 3, "3-4-3 starts three defenders");
  assert.equal(ops.benchOf(s).length, 2);
});

test("swaps are same-position only and must cross the XI line", () => {
  let s = ops.emptySquad("3-4-3");
  const defs = P.filter((p) => p.position === "DEF" && p.team_id % 3 === 0).slice(0, 4);
  for (const p of defs) s = ops.addPlayer(s, p);
  const starter = ops.xi(s).find((p) => p.position === "DEF");
  const benched = ops.benchOf(s)[0];
  const swapped = ops.swapStarter(s, benched.fpl_id, starter.fpl_id);
  assert.equal(swapped.players.find((p) => p.fpl_id === benched.fpl_id).starting, true);
  assert.equal(swapped.players.find((p) => p.fpl_id === starter.fpl_id).starting, false);

  const mid = find("MID", 3);
  s = ops.addPlayer(s, mid);
  const unchanged = ops.swapStarter(s, benched.fpl_id, mid.fpl_id);
  assert.deepEqual(unchanged, s, "cross-position swap is a no-op");
});

test("changing shape reseats the strongest legal eleven", () => {
  const full = ops.autoComplete(ops.emptySquad("3-4-3"), P, scoreOf);
  const reshaped = ops.applyStructure(full, "5-3-2", scoreOf);
  assert.equal(ops.countPos(reshaped, "DEF"), 5);
  assert.equal(ops.countPos(reshaped, "MID"), 3);
  assert.equal(ops.countPos(reshaped, "FWD"), 2);
  assert.equal(ops.xi(reshaped).length, 11);
  assert.equal(reshaped.players.length, 15, "reshaping never drops a player");
});

test("the bench puts the goalkeeper first and orders the rest by floor", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const order = ops.benchOrder(full, ctx.floorOf);
  assert.equal(order.length, 4);
  assert.equal(order[0].position, "GKP");
  for (let i = 2; i < order.length; i++) {
    assert.ok(ctx.floorOf(order[i - 1]) >= ctx.floorOf(order[i]) - 1e-9);
  }
});

/* ── auto-complete ────────────────────────────────────────────────────── */

test("auto-complete produces a legal fifteen inside the budget", () => {
  const done = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  assert.equal(done.players.length, 15);
  assert.equal(ops.isComplete(done), true);
  assert.deepEqual(ops.violations(done), []);
  assert.ok(ops.spend(done) <= R.budget + 1e-9, `spent ${ops.spend(done)}`);
  assert.ok(ops.bank(done) >= 0);
  assert.equal(ops.xi(done).length, 11);
});

test("auto-complete never exceeds three from one club", () => {
  const done = ops.autoComplete(ops.emptySquad("4-4-2"), P, scoreOf);
  const clubs = new Map();
  for (const p of done.players) clubs.set(p.team_id, (clubs.get(p.team_id) || 0) + 1);
  for (const [, n] of clubs) assert.ok(n <= R.maxPerClub);
});

test("auto-complete completes a part-built squad and keeps existing picks", () => {
  let s = ops.emptySquad("3-5-2");
  const keep = [find("FWD", 3), find("MID", 5)];
  for (const p of keep) s = ops.addPlayer(s, p);
  const done = ops.autoComplete(s, P, scoreOf);
  assert.equal(done.players.length, 15);
  for (const p of keep) assert.ok(done.players.some((x) => x.fpl_id === p.fpl_id), `${p.web_name} was dropped`);
});

test("auto-complete reserves enough budget to fill every remaining slot", () => {
  for (const st of ops.STRUCTURES) {
    const done = ops.autoComplete(ops.emptySquad(st.key), P, scoreOf);
    assert.equal(done.players.length, 15, `${st.key} finished with ${done.players.length}`);
    assert.ok(ops.bank(done) >= 0, `${st.key} overspent`);
  }
});

test("auto-complete is deterministic", () => {
  const a = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const b = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  assert.deepEqual(a.players.map((p) => p.fpl_id), b.players.map((p) => p.fpl_id));
});

test("the budget envelope shrinks as slots are filled", () => {
  const empty = ops.emptySquad("3-5-2");
  const wide = ops.envelopeFor(empty, "FWD", P);
  const filled = ops.autoComplete(empty, P, scoreOf);
  const narrow = ops.envelopeFor(ops.removePlayer(filled, filled.players[0].fpl_id), filled.players[0].position, P);
  assert.ok(wide > narrow, `${wide} vs ${narrow}`);
});

/* ── the four readouts ────────────────────────────────────────────────── */

test("the feedback panel exposes the readouts, the bench and the squad, and nothing else", () => {
  // DECISIONS 7.9: club concentration is part of structure, so the panel needs the squad itself.
  // The earlier form of this test asserted exactly four readouts plus the bench; that was written
  // before the scoring panel was specified. Widened deliberately, not accidentally.
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const out = ev.evaluateSquad(full, 1, ctx);
  assert.deepEqual(Object.keys(out).sort(), ["bench", "captaincy", "points", "risk", "squad", "structure"]);
});

test("projected points scale with the horizon and carry a floor and ceiling", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const one = ev.projectedPoints(full, 1, ctx);
  const six = ev.projectedPoints(full, 6, ctx);
  assert.ok(six.mean > one.mean * 4, `${one.mean} then ${six.mean}`);
  assert.ok(one.p10 < one.mean && one.mean < one.p90);
  assert.equal(six.extrapolated, true, "no stored per-gameweek rows means the readout says so");
});

test("the armband is counted once in the projection", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const auto = ev.projectedPoints(full, 1, ctx);
  const best = ops.bestCaptain(full, scoreOf, null);
  const bare = ops.xi(full).reduce((s, p) => s + scoreOf(p), 0);
  close(auto.mean, +(bare + scoreOf(best)).toFixed(1), 0.11);
});

test("stored per-gameweek rows are used in preference to extrapolation", () => {
  let s = ops.emptySquad("3-5-2");
  const p = find("FWD", 3);
  s = ops.addPlayer(s, p);
  const perGw = new Map([[p.fpl_id, [{ gw: 1, ep_mean: 9, p10: 3, p90: 15 }, { gw: 2, ep_mean: 7, p10: 2, p90: 13 }]]]);
  const out = ev.projectedPoints(s, 2, { ...ctx, perGw });
  // 9 + 7 for the two weeks, plus 9 again for the armband in week one
  close(out.mean, 25, 0.05);
  assert.equal(out.extrapolated, false);
});

test("captaincy ranks on doubled score and reports set against auto", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const auto = ev.captaincy(full, ctx);
  assert.equal(auto.set, false);
  close(auto.best.ev, +(scoreOf(auto.best.p) * 2).toFixed(2), 1e-9);
  for (let i = 1; i < auto.ranked.length; i++) assert.ok(auto.ranked[i - 1].ev >= auto.ranked[i].ev);

  const chosen = ops.xi(full).find((p) => p.fpl_id !== auto.best.p.fpl_id);
  const set = ev.captaincy({ ...full, captain: chosen.fpl_id }, ctx);
  assert.equal(set.set, true);
  assert.equal(set.best.p.fpl_id, chosen.fpl_id, "a set armband overrides the automatic pick");
});

test("captaincy is null on an empty pitch", () => {
  assert.equal(ev.captaincy(ops.emptySquad("3-5-2"), ctx), null);
});

test("risk flags name availability first, then rotation", () => {
  let s = ops.emptySquad("3-5-2");
  const injured = { ...find("MID", 1), status: "i" };
  const doubt = { ...find("DEF", 1), status: "d", chance_of_playing: 50 };
  const rotating = find("FWD", 1);
  for (const p of [injured, doubt, rotating]) s = ops.addPlayer(s, p);
  const minutes = new Map([[rotating.fpl_id, { p_start: 0.4 }]]);
  const out = ev.riskFlags(s, { minutes });
  assert.equal(out.count, 3);
  assert.equal(out.items[0].kind, "injured");
  assert.equal(out.items[1].kind, "doubt");
  assert.equal(out.items[1].detail, "50% chance");
  assert.equal(out.items[2].kind, "rotation");
  assert.equal(out.items[2].detail, "40% to start");
});

test("a healthy squad with no minutes data raises no flags", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  assert.equal(ev.riskFlags(full, { minutes: new Map() }).count, 0);
});

test("the structure readout accounts for every pound", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const out = ev.structureReadout(full, ctx);
  const summed = ["GKP", "DEF", "MID", "FWD"].reduce((s, pos) => s + out.byPos[pos].spend, 0);
  close(summed, out.spend, 0.05);
  close(out.spend + out.bank, R.budget, 0.05);
  assert.equal(out.complete, true);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) assert.equal(out.byPos[pos].count, R.composition[pos]);
});

/* ── transfer comparison ──────────────────────────────────────────────── */

test("replacements are same-position, affordable and never already owned", () => {
  const full = ops.autoComplete(ops.emptySquad("3-5-2"), P, scoreOf);
  const out = full.players.find((p) => p.position === "MID");
  const list = ev.replacements(full, out, P, ctx, 10);
  assert.ok(list.length > 0);
  const owned = new Set(full.players.map((p) => p.fpl_id));
  const budget = ops.bank(full) + out.price;
  for (const r of list) {
    assert.equal(r.player.position, "MID");
    assert.equal(owned.has(r.player.fpl_id), false);
    assert.ok(r.player.price <= budget + 1e-9);
    assert.ok(r.bankAfter >= -1e-9);
  }
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].delta >= list[i].delta);
});

test("replacements respect the club limit, counting the outgoing player as gone", () => {
  let s = ops.emptySquad("3-5-2");
  const trio = P.filter((p) => p.team_id === 9 && p.position === "MID").slice(0, 3);
  for (const p of trio) s = ops.addPlayer(s, p);

  // Selling one of the three frees a slot, so that club is legal again for the incoming player.
  const freed = ev.replacements(s, trio[0], P, ctx, 40);
  assert.ok(freed.some((r) => r.player.team_id === 9), "a slot at that club has been freed");

  // Selling a player from elsewhere does not, because three from that club are still held.
  const other = P.find((p) => p.team_id === 1 && p.position === "MID");
  s = ops.addPlayer(s, other);
  const blocked = ev.replacements(s, other, P, ctx, 40);
  assert.equal(blocked.some((r) => r.player.team_id === 9), false, "three from that club are still held");
});

test("the hit threshold is never assumed", () => {
  assert.equal(ev.hitWorthIt(9, null), null);
  assert.equal(ev.hitWorthIt(9, 2), true);
  assert.equal(ev.hitWorthIt(4, 2), false);
});

/* ── the xP gate and labelling ────────────────────────────────────────── */

test("availability and fixture multipliers behave", () => {
  assert.equal(availabilityMult({ status: "i" }), 0);
  assert.equal(availabilityMult({ status: "a", chance_of_playing: null }), 1);
  close(availabilityMult({ status: "d", chance_of_playing: 75 }), 0.75, 1e-9);

  const easy = fixtureMult({ position: "FWD" }, { forGoals: 2.4, againstGoals: 0.8 }, 2.8);
  const hard = fixtureMult({ position: "FWD" }, { forGoals: 0.8, againstGoals: 2.4 }, 2.8);
  assert.ok(easy > hard);
  const keeper = fixtureMult({ position: "GKP" }, { forGoals: 0.8, againstGoals: 0.6 }, 2.8);
  assert.ok(keeper > 1, "a keeper facing few goals should be marked up");
  assert.equal(fixtureMult({ position: "MID" }, null, 2.8), 1);
});

test("the scorer prefers the engine, then the archive, then Understat, then zero", () => {
  const p = { fpl_id: 1, position: "MID", team_id: 1, status: "a", chance_of_playing: null };
  const common = {
    envByTeam: new Map(), leagueMeanGoals: null,
    goalPoints: { GKP: 6, DEF: 6, MID: 5, FWD: 4 }, assistPoints: 3, appearancePoints: 2,
  };
  const engine = buildScorer({
    ...common,
    projections: new Map([[1, { ep_mean: 6.4, quantiles: { p10: 2, p50: 6, p90: 12 }, p_12plus: 0.2 }]]),
    archivePer90: new Map(), understat: new Map(),
  });
  assert.equal(engine.sourceOf(p), "engine");
  close(engine.scoreOf(p), 6.4, 1e-9);
  assert.equal(engine.bandOf(p).real, true);
  close(engine.tailOf(p), 0.2, 1e-9);

  const archive = buildScorer({
    ...common, projections: new Map(),
    archivePer90: new Map([[1, { pointsPer90: 4.2, nineties: 25 }]]), understat: new Map(),
  });
  assert.equal(archive.sourceOf(p), "archive");
  close(archive.scoreOf(p), 4.2, 1e-9);
  assert.equal(archive.bandOf(p).real, false, "an interim band must not claim to be measured");

  const us = buildScorer({
    ...common, projections: new Map(), archivePer90: new Map(),
    understat: new Map([[1, { minutes: 2000, xg: 8, xa: 6 }]]),
  });
  assert.equal(us.sourceOf(p), "understat");
  assert.ok(us.scoreOf(p) > 2);

  const none = buildScorer({ ...common, projections: new Map(), archivePer90: new Map(), understat: new Map() });
  assert.equal(none.sourceOf(p), "none");
  assert.equal(none.scoreOf(p), 0);
});

test("an unavailable player scores zero on the interim path", () => {
  const scorer = buildScorer({
    projections: new Map(), archivePer90: new Map([[1, { pointsPer90: 5, nineties: 30 }]]), understat: new Map(),
    envByTeam: new Map(), leagueMeanGoals: null,
    goalPoints: { GKP: 6, DEF: 6, MID: 5, FWD: 4 }, assistPoints: 3, appearancePoints: 2,
  });
  assert.equal(scorer.scoreOf({ fpl_id: 1, position: "MID", team_id: 1, status: "i" }), 0);
});

test("a thin Understat sample is not trusted", () => {
  const scorer = buildScorer({
    projections: new Map(), archivePer90: new Map(),
    understat: new Map([[1, { minutes: 90, xg: 2, xa: 2 }]]),
    envByTeam: new Map(), leagueMeanGoals: null,
    goalPoints: { GKP: 6, DEF: 6, MID: 5, FWD: 4 }, assistPoints: 3, appearancePoints: 2,
  });
  assert.equal(scorer.sourceOf({ fpl_id: 1, position: "MID", team_id: 1, status: "a" }), "none");
});

test("the projected-points label is xP regardless of the calibration gate", async () => {
  // Superseded rule: xP used to be withheld until the gate passed. Louis removed that on 26 Jul 2026.
  const { metricName, metricLabel, interimChip } = await import("../lib/solver/score.mjs");
  assert.equal(metricName(false), "xP");
  assert.equal(metricName(true), "xP");
  assert.match(metricLabel(false), /xP/);
  assert.match(metricLabel(true), /xP/);
  assert.doesNotMatch(metricLabel(false), /INTERIM/);
  assert.equal(interimChip("score"), null, "nothing is labelled provisional to the user");
});
