import test from "node:test";
import assert from "node:assert/strict";
import { buildExactSquadForRange } from "../lib/server/exact-range-optimiser.mjs";

const mk = (fpl_id, position, team_id, price, scores) => ({
  fpl_id, web_name: `P${fpl_id}`, position, team_id, team: `T${team_id}`, price, scores,
});
const scoreForGw = (player, gw) => player.scores[gw - 1];
const pool = [
  mk(1,"GKP",1,4.5,[4,4,4]), mk(2,"GKP",2,5.0,[5,5,5]), mk(3,"GKP",3,5.5,[8,1,8]),
  mk(10,"DEF",4,4.0,[3,3,3]), mk(11,"DEF",5,4.5,[4,4,4]), mk(12,"DEF",6,5.0,[6,2,6]),
  mk(13,"DEF",7,5.0,[2,7,2]), mk(14,"DEF",8,5.5,[7,7,1]), mk(15,"DEF",9,6.0,[8,8,8]),
  mk(20,"MID",10,5.0,[4,4,4]), mk(21,"MID",11,5.5,[5,5,5]), mk(22,"MID",12,6.0,[7,2,7]),
  mk(23,"MID",13,6.5,[2,8,2]), mk(24,"MID",14,7.0,[8,8,1]), mk(25,"MID",15,8.0,[9,9,9]),
  mk(30,"FWD",16,5.0,[4,4,4]), mk(31,"FWD",17,6.0,[6,2,6]), mk(32,"FWD",18,7.0,[2,8,2]),
  mk(33,"FWD",19,8.0,[9,9,9]),
];

function combinations(values, count) {
  const output = [];
  const visit = (start, picked) => {
    if (picked.length === count) { output.push([...picked]); return; }
    const needed = count - picked.length;
    for (let index = start; index <= values.length - needed; index += 1) {
      picked.push(values[index]); visit(index + 1, picked); picked.pop();
    }
  };
  visit(0, []);
  return output;
}

const formations = [
  { DEF:3,MID:4,FWD:3 }, { DEF:3,MID:5,FWD:2 }, { DEF:4,MID:3,FWD:3 },
  { DEF:4,MID:4,FWD:2 }, { DEF:4,MID:5,FWD:1 }, { DEF:5,MID:2,FWD:3 },
  { DEF:5,MID:3,FWD:2 }, { DEF:5,MID:4,FWD:1 },
];

function bestWeek(squad, gw, chip) {
  const byPos = Object.fromEntries(["GKP","DEF","MID","FWD"].map((pos) => [pos, squad.filter((p) => p.position === pos)]));
  let best = -Infinity;
  for (const shape of formations) {
    for (const gkp of combinations(byPos.GKP,1))
      for (const def of combinations(byPos.DEF,shape.DEF))
        for (const mid of combinations(byPos.MID,shape.MID))
          for (const fwd of combinations(byPos.FWD,shape.FWD)) {
            const xi = [...gkp,...def,...mid,...fwd];
            const xiCost = xi.reduce((sum,p) => sum+p.price,0);
            const benchCost = squad.reduce((sum,p) => sum+p.price,0)-xiCost;
            if (xiCost > 83 + 1e-9 || benchCost < 17 - 1e-9) continue;
            const captain = Math.max(...xi.map((p) => scoreForGw(p,gw)));
            const base = chip === "benchboost"
              ? squad.reduce((sum,p) => sum+scoreForGw(p,gw),0)
              : xi.reduce((sum,p) => sum+scoreForGw(p,gw),0);
            best = Math.max(best, base + captain);
          }
  }
  return best;
}

function bruteForce(chipGw) {
  const byPos = Object.fromEntries(["GKP","DEF","MID","FWD"].map((pos) => [pos,pool.filter((p)=>p.position===pos)]));
  let best = -Infinity;
  for (const gkp of combinations(byPos.GKP,2))
    for (const def of combinations(byPos.DEF,5))
      for (const mid of combinations(byPos.MID,5))
        for (const fwd of combinations(byPos.FWD,3)) {
          const squad = [...gkp,...def,...mid,...fwd];
          if (squad.reduce((sum,p)=>sum+p.price,0) > 100 + 1e-9) continue;
          const clubs = new Map();
          for (const p of squad) clubs.set(p.team_id,(clubs.get(p.team_id)||0)+1);
          if ([...clubs.values()].some((count)=>count>3)) continue;
          let total = 0;
          let legal = true;
          for (let gw=1; gw<=3; gw+=1) {
            const week = bestWeek(squad,gw,gw===chipGw?"benchboost":null);
            if (!Number.isFinite(week)) { legal=false; break; }
            total += week;
          }
          if (legal) best = Math.max(best,total);
        }
  return best;
}

test("HiGHS proves zero-gap optimality and matches independent exhaustive enumeration", async () => {
  const result = await buildExactSquadForRange({
    pool, scoreForGw, gwFrom:1, gwTo:3,
    chipForGw:(gw)=>gw===2?"benchboost":null,
    budget:100, benchBudget:17, maxPerClub:3,
  });
  assert.equal(result.ok,true,result.error);
  assert.equal(result.solver.engine,"HiGHS");
  assert.equal(result.solver.status,"OPTIMAL");
  assert.equal(result.solver.optimality_proven,true);
  assert.equal(result.solver.mip_gap,0);
  assert.equal(result.solver.timeout_used,false);
  assert.equal(result.solver.fallback_used,false);
  assert.equal(result.xi.length + result.bench.length,15);
  const exhaustive = bruteForce(2);
  assert.ok(Math.abs(result.total.gross_xpts-exhaustive)<0.001,`${result.total.gross_xpts} !== ${exhaustive}`);
});

test("every returned week satisfies the exact budget and lineup constraints", async () => {
  const result = await buildExactSquadForRange({
    pool, scoreForGw, gwFrom:1, gwTo:3,
    chipForGw:(gw)=>gw===1?"benchboost":null,
    budget:100, benchBudget:17, maxPerClub:3,
  });
  assert.equal(result.ok,true,result.error);
  for (const week of result.weekly) {
    assert.equal(week.starters.length,11);
    assert.equal(week.bench.length,4);
    assert.ok(week.xi_cost <= 83 + 1e-9);
    assert.ok(week.bench_cost >= 17 - 1e-9);
    assert.ok(week.starters.some((p)=>p.fpl_id===week.captain));
  }
});

test("every Bench Boost placement and the no-chip range match independent exhaustive enumeration", async () => {
  for (const chipGw of [0, 1, 2, 3]) {
    const result = await buildExactSquadForRange({
      pool, scoreForGw, gwFrom:1, gwTo:3,
      chipForGw:(gw)=>gw===chipGw?"benchboost":null,
      budget:100, benchBudget:17, maxPerClub:3,
    });
    assert.equal(result.ok,true,result.error);
    assert.equal(result.solver.status,"OPTIMAL");
    assert.equal(result.solver.optimality_proven,true);
    assert.equal(result.solver.mip_gap,0);
    const exhaustive = bruteForce(chipGw);
    assert.ok(Math.abs(result.total.gross_xpts-exhaustive)<0.001,
      `chip GW${chipGw || "none"}: ${result.total.gross_xpts} !== ${exhaustive}`);
  }
});
