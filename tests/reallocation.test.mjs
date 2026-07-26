// Role reallocation. Every test states the decision it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { reallocate, reallocatePenalties, reallocateShares, AVAILABLE } from "../lib/engine/role_reallocation.mjs";

const P = (id, position, team_id, status = "a", chance = null, web_name = "p" + id) =>
  ({ id, position, team_id, status, chance_of_playing: chance, web_name });

test("availability reads status and chance of playing, nothing else (12.7)", () => {
  assert.equal(AVAILABLE(P(1, "MID", 1)), true);
  assert.equal(AVAILABLE(P(2, "MID", 1, "i")), false, "injured");
  assert.equal(AVAILABLE(P(3, "MID", 1, "s")), false, "suspended");
  assert.equal(AVAILABLE(P(4, "MID", 1, "a", 25)), false, "25 per cent chance");
  assert.equal(AVAILABLE(P(5, "MID", 1, "a", 75)), true, "75 per cent chance");
});

test("penalty duty passes to the next available taker at the same club (9.12)", () => {
  const players = [P(1, "FWD", 10), P(2, "MID", 10), P(3, "FWD", 20)];
  const duties = [
    { player_id: 1, kind: "penalty", confidence: 0.9 },
    { player_id: 2, kind: "penalty", confidence: 0.6 },
    { player_id: 3, kind: "penalty", confidence: 0.8 },
  ];
  const fit = reallocatePenalties(players, duties);
  assert.equal(fit.get(1).onPenalties, true, "the first-choice taker holds the duty");
  assert.equal(fit.get(2).onPenalties, false);
  assert.equal(fit.get(3).onPenalties, true, "a different club is unaffected");

  const out = [P(1, "FWD", 10, "i"), P(2, "MID", 10), P(3, "FWD", 20)];
  const moved = reallocatePenalties(out, duties);
  assert.equal(moved.get(1).onPenalties, false, "an injured taker loses the duty");
  assert.equal(moved.get(2).onPenalties, true, "the next taker inherits it");
  assert.match(moved.get(2).note ?? moved.get(2).promotedBecause ?? "", /unavailable/);
});

test("an absent player's share is absorbed proportionally, nothing created or lost (9.12)", () => {
  const players = [P(1, "MID", 10), P(2, "MID", 10), P(3, "MID", 10)];
  const share = { 1: 0.5, 2: 0.3, 3: 0.2 };
  const before = Object.values(share).reduce((a, b) => a + b, 0);

  const same = reallocateShares(players, (p) => share[p.id]);
  assert.equal(same.get(1), 0.5, "with everyone available nothing moves");

  const out = [P(1, "MID", 10, "i"), P(2, "MID", 10), P(3, "MID", 10)];
  const moved = reallocateShares(out, (p) => share[p.id]);
  assert.equal(moved.get(1), 0, "the absent player is zeroed");
  const after = [...moved.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(after - before) < 1e-9, `total share must be conserved, was ${before} now ${after}`);
  // 0.5 freed, split 0.3:0.2 between the two remaining
  assert.ok(Math.abs(moved.get(2) - 0.6) < 1e-9, `expected 0.6, got ${moved.get(2)}`);
  assert.ok(Math.abs(moved.get(3) - 0.4) < 1e-9, `expected 0.4, got ${moved.get(3)}`);
});

test("share is split evenly when the remaining players had none", () => {
  const players = [P(1, "FWD", 10, "i"), P(2, "FWD", 10), P(3, "FWD", 10)];
  const share = { 1: 0.6, 2: 0, 3: 0 };
  const moved = reallocateShares(players, (p) => share[p.id]);
  assert.ok(Math.abs(moved.get(2) - 0.3) < 1e-9);
  assert.ok(Math.abs(moved.get(3) - 0.3) < 1e-9);
});

test("a whole position group being out loses the share rather than inventing a taker", () => {
  const players = [P(1, "FWD", 10, "i"), P(2, "FWD", 10, "i")];
  const moved = reallocateShares(players, () => 0.4);
  assert.equal(moved.get(1), 0);
  assert.equal(moved.get(2), 0);
});

test("reallocation never crosses clubs or position groups", () => {
  const players = [P(1, "MID", 10, "i"), P(2, "MID", 20), P(3, "FWD", 10)];
  const moved = reallocateShares(players, () => 0.5);
  assert.equal(moved.get(2), 0.5, "another club must not absorb the share");
  assert.equal(moved.get(3), 0.5, "another position group must not absorb it");
});

test("the combined call reports availability, share, duty and a reason", () => {
  const players = [P(1, "FWD", 10, "i", null, "Haaland"), P(2, "FWD", 10, "a", null, "Marmoush")];
  const duties = [{ player_id: 1, kind: "penalty", confidence: 0.95 }, { player_id: 2, kind: "penalty", confidence: 0.5 }];
  const r = reallocate({ players, duties, shareOf: (p) => (p.id === 1 ? 0.7 : 0.3) });
  assert.equal(r.get(1).available, false);
  assert.equal(r.get(1).share, 0);
  assert.equal(r.get(2).share, 1.0, "the whole group share is now his");
  assert.equal(r.get(2).onPenalties, true);
  assert.match(r.get(2).note, /Haaland unavailable/);
});
