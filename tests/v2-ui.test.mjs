import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestXI } from "../lib/solver/autobuild.mjs";
import { optimiseSquad } from "../lib/solver/optimise.mjs";
import { clampGameweekRange, gameweekRangeLabel, gameweekWindow, totalForGameweekRange } from "../lib/gameweek-range.mjs";
import { snapshotForUndo, restoreUndoSnapshot } from "../lib/undo.mjs";
import { makeV2EightGameweekFixture } from "./fixtures/v2-eight-gameweeks.mjs";

const fixture = makeV2EightGameweekFixture();
const rangeScore = (from, to) => (player) => totalForGameweekRange(player, from, to, fixture.scoreForGw) ?? 0;
const squadFrom = (result) => ({ structure: result.formation, players: [...result.xi, ...result.bench],
  captain: result.xi[0]?.fpl_id ?? null, vice: result.xi[1]?.fpl_id ?? null });

function assertLegal(squad) {
  assert.equal(squad.players.length, 15);
  assert.deepEqual(Object.fromEntries(["GKP", "DEF", "MID", "FWD"].map((position) => [position,
    squad.players.filter((player) => player.position === position).length])), { GKP: 2, DEF: 5, MID: 5, FWD: 3 });
  assert.ok(squad.players.reduce((sum, player) => sum + Number(player.price), 0) <= 100 + 1e-9);
  const clubs = new Map();
  for (const player of squad.players) clubs.set(player.team_id, (clubs.get(player.team_id) || 0) + 1);
  for (const count of clubs.values()) assert.ok(count <= 3);
  const xi = squad.players.filter((player) => player.starting);
  assert.equal(xi.length, 11);
  const [def, mid, fwd] = squad.structure.split("-").map(Number);
  assert.equal(xi.filter((player) => player.position === "GKP").length, 1);
  assert.equal(xi.filter((player) => player.position === "DEF").length, def);
  assert.equal(xi.filter((player) => player.position === "MID").length, mid);
  assert.equal(xi.filter((player) => player.position === "FWD").length, fwd);
}

test("the deterministic fixture contains eight genuinely different gameweeks", () => {
  assert.deepEqual(fixture.gameweeks, [1, 2, 3, 4, 5, 6, 7, 8]);
  const short = fixture.players.find((player) => player.style === "short");
  const long = fixture.players.find((player) => player.style === "long");
  assert.ok(fixture.scoreForGw(short, 1) > fixture.scoreForGw(long, 1));
  assert.ok(rangeScore(1, 8)(short) < rangeScore(1, 8)(long));
});

test("range bounds, labels and selected-range totals are exact", () => {
  assert.deepEqual(clampGameweekRange(6, 3, 1, 8), { from: 6, to: 6 });
  assert.deepEqual(gameweekWindow(3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 8), { first: 3, last: 10 });
  assert.equal(gameweekRangeLabel(1, 1), "GW1");
  assert.equal(gameweekRangeLabel(1, 4), "GW1 TO GW4");
  assert.equal(gameweekRangeLabel(3, 8), "GW3 TO GW8");
  const player = fixture.players.find((item) => item.style === "long");
  assert.equal(rangeScore(3, 8)(player), [3, 4, 5, 6, 7, 8].reduce((sum, gw) => sum + fixture.scoreForGw(player, gw), 0));
});

test("horizon changes alter totals, value, sorting and Builder selection", () => {
  const short = fixture.players.find((player) => player.style === "short");
  const long = fixture.players.find((player) => player.style === "long");
  assert.ok(rangeScore(1, 1)(short) / short.price > rangeScore(1, 1)(long) / long.price);
  assert.ok(rangeScore(1, 8)(short) / short.price < rangeScore(1, 8)(long) / long.price);
  const one = bestXI({ pool: fixture.players, xpOf: rangeScore(1, 1) });
  const eight = bestXI({ pool: fixture.players, xpOf: rangeScore(1, 8) });
  assert.ok(one && eight);
  assert.notDeepEqual(new Set([...one.xi, ...one.bench].map((player) => player.fpl_id)),
    new Set([...eight.xi, ...eight.bench].map((player) => player.fpl_id)));
  assertLegal(squadFrom(one));
  assertLegal(squadFrom(eight));
});

test("Build Squad respects locks and ignored players while spending legally", () => {
  const locked = fixture.players.find((player) => player.position === "FWD" && player.style === "long");
  const ignored = [...fixture.players].filter((player) => player.fpl_id !== locked.fpl_id)
    .sort((a, b) => rangeScore(1, 4)(b) - rangeScore(1, 4)(a))[0];
  const result = bestXI({ pool: fixture.players, xpOf: rangeScore(1, 4), locks: [locked.fpl_id], ignores: [ignored.fpl_id] });
  assert.ok(result);
  const squad = squadFrom(result);
  assertLegal(squad);
  assert.ok(result.xi.some((player) => player.fpl_id === locked.fpl_id));
  assert.ok(!squad.players.some((player) => player.fpl_id === ignored.fpl_id));
  assert.ok(result.cost > 70 && result.cost <= 100, `unexpected spend ${result.cost}`);
});

test("Fill Gaps preserves every valid current selection, including a later ignored pick", () => {
  const full = bestXI({ pool: fixture.players, xpOf: rangeScore(1, 4) });
  const picked = [...full.xi, ...full.bench].slice(0, 7);
  const result = bestXI({ pool: fixture.players, xpOf: rangeScore(1, 4), keep: picked.map((player) => player.fpl_id),
    ignores: [picked[0].fpl_id] });
  assert.ok(result);
  const squad = squadFrom(result);
  assertLegal(squad);
  for (const player of picked) assert.ok(squad.players.some((item) => item.fpl_id === player.fpl_id));
});

test("Improve rebuilds through bestXI, replacing unlocked players while preserving locks", () => {
  const built = squadFrom(bestXI({ pool: fixture.players, xpOf: rangeScore(1, 8) }));
  const outgoing = built.players.find((player) => !player.starting);
  const bad = { ...outgoing, fpl_id: 9999, id: 9999, team_id: 99, team: "T99", web_name: "Deliberate downgrade", price: 4 };
  fixture.projections.set(bad.fpl_id, new Map(fixture.gameweeks.map((gw) => [gw, 0])));
  const weakened = { ...built, players: built.players.map((player) => player.fpl_id === outgoing.fpl_id ? bad : player) };
  const locked = weakened.players.find((player) => player.starting);
  const rebuilt = bestXI({ pool: [...fixture.players, bad], xpOf: rangeScore(1, 8),
    locks: [locked.fpl_id], ignores: [] });
  assert.ok(rebuilt);
  const improved = squadFrom(rebuilt);
  assert.ok(improved.players.some((player) => player.fpl_id === locked.fpl_id));
  assert.ok(!improved.players.some((player) => player.fpl_id === bad.fpl_id));
  assertLegal(improved);
});

test("Optimise XI retains the chosen 15 and sets every gameweek decision", () => {
  const squad = squadFrom(bestXI({ pool: fixture.players, xpOf: rangeScore(1, 8) }));
  const before = squad.players.map((player) => player.fpl_id).sort((a, b) => a - b);
  const locked = squad.players.find((player) => player.starting);
  const optimised = optimiseSquad(squad, rangeScore(3, 3), { requiredStarterIds: [locked.fpl_id] });
  assert.deepEqual(optimised.players.map((player) => player.fpl_id).sort((a, b) => a - b), before);
  assert.equal(optimised.players.filter((player) => player.starting).length, 11);
  assert.equal(optimised.benchOrder.length, 4);
  assert.ok(optimised.captain && optimised.vice && optimised.captain !== optimised.vice);
  assert.ok(optimised.players.find((player) => player.fpl_id === optimised.captain).starting);
  assert.ok(optimised.players.find((player) => player.fpl_id === locked.fpl_id).starting);
  assertLegal({ ...squad, structure: optimised.structure, players: optimised.players });
});

test("one-step undo restores the immediately previous state without aliasing", () => {
  const previous = { squad: squadFrom(bestXI({ pool: fixture.players, xpOf: rangeScore(1, 1) })), locks: [1] };
  const snapshot = snapshotForUndo(previous);
  previous.squad.players.length = 0;
  const restored = restoreUndoSnapshot(snapshot);
  assert.equal(restored.squad.players.length, 15);
  assert.deepEqual(restored.locks, [1]);
  assert.notEqual(restored, snapshot);
});

test("every named Builder action is wired to its matching behaviour", () => {
  const source = readFileSync(new URL("../app/builder/BuilderClient.jsx", import.meta.url), "utf8");
  assert.match(source, /BUILD BEST SQUAD/);
  assert.ok(!source.includes("improveSquad"));
  assert.match(source, /onClick=\{doRebuild\}/, "the one action is wired to the full solve");
  assert.ok(!/doBestXI|doOptimise/.test(source), "the two redundant actions are gone");
  assert.match(source, /Squad cleared/);
  assert.match(source, /onClick=\{savePlan\}/);
  assert.match(source, /onClick=\{undo\}/);
});

test("Saved Squad range optimisation is atomic, gameweek-specific and preserves the base 15", () => {
  const source = readFileSync(new URL("../app/squad/SquadClient.jsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("const doOptimiseRange"), source.indexOf("const changeRange"));
  assert.equal((handler.match(/writePlan\(/g) || []).length, 1);
  assert.match(handler, /applyOptimisedRangeToPlan\(shaped, rangeProjection\)/);
  assert.ok(!/base:/.test(handler));
  assert.match(source, /OPTIMISE GW\{gwFrom\}\{gwTo === gwFrom/);

  const helper = readFileSync(new URL("../lib/plan-range.mjs", import.meta.url), "utf8");
  /* Keys are canonical "1".."38" strings. A stray key makes the whole draft unsaveable from the API and
     cannot be cleared from the interface, so it is guarded where it is written, not only on save. */
  assert.match(helper, /next\.weeks\[String\(canonicalGw\)\] = \{[\s\S]*structure: week\.structure[\s\S]*startingIds: \[\.\.\.week\.starting_ids\][\s\S]*benchOrder:[\s\S]*captain: week\.captain[\s\S]*vice: week\.vice_captain/);
  assert.match(helper, /canonicalGw < 1 \|\| canonicalGw > 38\) continue/);
  assert.ok(!/next\.base\s*=/.test(helper));
});

test("shared product controls expose the selected data instead of hiding it", () => {
  const range = readFileSync(new URL("../components/GameweekRange.jsx", import.meta.url), "utf8");
  const candidates = readFileSync(new URL("../components/Candidates.jsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
  const outlook = readFileSync(new URL("../components/FixtureOutlook.jsx", import.meta.url), "utf8");
  assert.match(range, /<select/);
  assert.ok(!/type="range"/.test(range));
  assert.match(candidates, /PRICE/);
  assert.match(candidates, /XPTS/);
  assert.match(candidates, /VALUE/);
  assert.match(candidates, /formatMetric/);
  assert.ok(!dashboard.includes('"/analysis"'));
  assert.ok(!dashboard.includes("GitCompareArrows"));
  assert.match(outlook, /EASIEST FOR ATTACK/);
  assert.match(outlook, /EASIEST FOR DEFENCE/);
  assert.ok(!/Fixtures not published yet/.test(outlook));
});
