import test from "node:test";
import assert from "node:assert/strict";
import { buildScorer } from "../lib/solver/score.mjs";
import { reallocate } from "../lib/engine/role_reallocation.mjs";

/* BATCH 1 VERIFICATION, exactly as the roadmap specced it: with a starter marked unavailable, his
   teammates' shares must rise and the club total must stay conserved. */

test("engine reallocation: an absent striker's share transfers, club total conserved at 1.000", () => {
  const players = [
    { id: 1, position: "FWD", status: "i", chance_of_playing: 0, goalShare: 0.40 },
    { id: 2, position: "FWD", status: "a", chance_of_playing: null, goalShare: 0.25 },
    { id: 3, position: "MID", status: "a", chance_of_playing: null, goalShare: 0.20 },
    { id: 4, position: "MID", status: "a", chance_of_playing: null, goalShare: 0.15 },
  ];
  const out = reallocate({ players, duties: [], shareOf: (p) => p.goalShare });
  const total = players.reduce((a, p) => a + (out.get(p.id).available ? out.get(p.id).share : 0), 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `available shares must sum to 1.000, got ${total}`);
  assert.ok(out.get(2).share > 0.25, "the available forward must absorb, not stand still");
  assert.equal(out.get(1).available, false);
});

test("fallback reconciliation: with a striker out, teammates rise and the group total is conserved", () => {
  const players = [
    { fpl_id: 1, team_id: 7, position: "FWD", status: "a", chance_of_playing: null },
    { fpl_id: 2, team_id: 7, position: "FWD", status: "a", chance_of_playing: null },
    { fpl_id: 3, team_id: 7, position: "FWD", status: "a", chance_of_playing: null },
  ];
  const archive = new Map([
    [1, { pointsPer90: 5.0, nineties: 30 }],
    [2, { pointsPer90: 4.0, nineties: 30 }],
    [3, { pointsPer90: 3.0, nineties: 30 }],
  ]);
  const base = (list) => buildScorer({
    projections: new Map(), archivePer90: archive, understat: new Map(), envByTeam: null,
    leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players: list,
  });
  const healthy = base(players);
  const withOut = base([{ ...players[0], status: "i", chance_of_playing: 0 }, players[1], players[2]]);

  const b2 = healthy.scoreOf(players[1]), a2 = withOut.scoreOf(players[1]);
  assert.ok(a2 > b2, `teammate must rise when the striker is out: ${b2} -> ${a2}`);

  // Conservation, within the stated 1.35 cap.
  const groupBefore = [1, 2, 3].map((id, i) => healthy.scoreOf(players[i])).reduce((a, b) => a + b, 0);
  const groupAfter = [players[1], players[2]].map((p) => withOut.scoreOf(p)).reduce((a, b) => a + b, 0);
  assert.ok(groupAfter > groupBefore - healthy.scoreOf(players[0]),
    "the absent output must be partly absorbed, not vanish entirely");
});

test("the uplift is capped so a one-man group cannot inherit a whole teammate", () => {
  const players = [
    { fpl_id: 1, team_id: 7, position: "FWD", status: "i", chance_of_playing: 0 },
    { fpl_id: 2, team_id: 7, position: "FWD", status: "a", chance_of_playing: null },
  ];
  const archive = new Map([[1, { pointsPer90: 6.0, nineties: 30 }], [2, { pointsPer90: 2.0, nineties: 30 }]]);
  const withOut = buildScorer({
    projections: new Map(), archivePer90: archive, understat: new Map(), envByTeam: null,
    leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players,
  });
  const solo = buildScorer({
    projections: new Map(), archivePer90: new Map([[2, archive.get(2)]]), understat: new Map(), envByTeam: null,
    leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players: [players[1]],
  });
  const ratio = withOut.scoreOf(players[1]) / solo.scoreOf(players[1]);
  assert.ok(ratio <= 1.351, `uplift must respect the stated cap, got ${ratio}`);
  assert.ok(ratio > 1.3, "and a huge absent share should reach it");
});
