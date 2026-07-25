"use client";
/* THE SOLVER — evaluation services, pure arithmetic over stored engine output.
   Zero AI calls, by rule. Nothing in this file may import a network client of any kind. */
import params from "../config/model-params.json";
import rules from "../config/rules-2026-27.json";
import { BUDGET, COMPOSITION, MAX_PER_CLUB, POS_ORDER, posCount, clubCount, squadCost, bankOf, splitSquad, feasibleFormations, autosubPaths } from "./squad";

const DECAY = params.solver.horizon_decay_per_gw.value;
const BENCH_SCALE = params.solver.bench_quality_scale.value;
const HIT = rules.transfers.hit_cost.value;

/* Horizon sum. Later gameweeks are discounted: the fixture list is known but the squad,
   the prices and the injuries are not. */
export function horizonPoints(scorePerGw, horizon) {
  let total = 0;
  for (let g = 0; g < horizon; g++) total += scorePerGw * (1 - DECAY * g);
  return total;
}

/* READOUT 1 — projected points over a 1–12 gameweek horizon, with a spread when the
   distribution is available and an honest blank when it is not. */
export function projectedPoints(squad, formation, horizon, gate) {
  const { xi } = splitSquad(squad, formation);
  const per = xi.reduce((s, p) => s + Number(p.score || 0), 0);
  const total = horizonPoints(per, horizon);
  if (!gate.passed) return { total: Math.round(total), low: null, high: null, basis: "interim" };
  const varSum = xi.reduce((s, p) => {
    const spread = (Number(p.p90 ?? p.score) - Number(p.p10 ?? p.score)) / 2.563;   // p10..p90 ≈ 2.563 sd
    return s + spread * spread;
  }, 0);
  const sd = Math.sqrt(varSum * horizon);
  return {
    total: Math.round(total),
    low: Math.round(total - 1.2816 * sd),
    high: Math.round(total + 1.2816 * sd),
    basis: "xP",
  };
}

/* READOUT 2 — captaincy strength. Ranks the XI on doubled score, carries P(12+) when the
   distribution exists, and reports whether the captain is set or inferred. */
export function captaincy(squad, formation, captainId, gate) {
  const { xi } = splitSquad(squad, formation);
  if (!xi.length) return null;
  const ranked = [...xi].sort((a, b) => Number(b.score) - Number(a.score));
  const chosen = captainId ? xi.find((p) => p.id === captainId) : null;
  const cap = chosen || ranked[0];
  const options = ranked.slice(0, 4).map((p) => ({
    ...p,
    doubled: +(Number(p.score) * 2).toFixed(1),
    p12: gate.passed ? p.p12 : null,
    isCaptain: cap && p.id === cap.id,
  }));
  const best = ranked[0];
  const gap = cap && best ? +(Number(best.score) - Number(cap.score)).toFixed(2) : 0;
  return {
    captain: cap,
    mode: chosen ? "SET" : "AUTO",
    doubled: +(Number(cap.score) * 2).toFixed(1),
    p12: gate.passed ? cap.p12 : null,
    options,
    differentialGap: gap,
    tolerance: params.solver.captaincy_differential_tolerance.value,
    withinTolerance: gap <= params.solver.captaincy_differential_tolerance.value,
  };
}

/* READOUT 3 — risk flags. Counts and names them; never silently swallows one. */
export function riskFlags(squad, gate) {
  const flags = [];
  for (const p of squad) {
    if (p.status && p.status !== "a") {
      const label = p.status === "d" ? "Doubt" : p.status === "i" ? "Injured" : p.status === "s" ? "Suspended" : "Unavailable";
      const chance = p.chance_of_playing !== null && p.chance_of_playing !== undefined ? ` · ${p.chance_of_playing}% chance` : "";
      flags.push({ player: p, kind: "availability", note: label + chance });
    } else if (gate.passed && p.pStart !== null && p.pStart !== undefined && Number(p.pStart) < 0.7) {
      flags.push({ player: p, kind: "minutes", note: `Start probability ${Math.round(Number(p.pStart) * 100)}%` });
    }
    if (p.lowSample) flags.push({ player: p, kind: "sample", note: "Low sample · promoted priors active" });
  }
  return flags;
}

/* READOUT 4 — structure. Budget spread by position plus a bench-quality score built on the
   floor the bench actually protects, not on its headline scores. */
export function structure(squad, formation) {
  const spend = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of squad) spend[p.position] += Number(p.price || 0);
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const { xi, bench } = splitSquad(squad, formation);
  const paths = autosubPaths(xi, bench);
  const covered = paths.filter((p) => p.replacement).length;
  const benchScore = bench.length
    ? Math.min(10, (bench.reduce((s, p) => s + Number(p.score || 0), 0) / bench.length) * BENCH_SCALE)
    : 0;
  return {
    spend, total,
    bench, benchScore: +benchScore.toFixed(1),
    autosubCoverage: xi.length ? covered / xi.length : 0,
    cost: +squadCost(squad).toFixed(1),
    bank: bankOf(squad),
  };
}

/* All four readouts in one call — this is what the Builder's feedback panel renders. */
export function evaluateSquad(squad, formation, horizon, captainId, gate) {
  return {
    projected: projectedPoints(squad, formation, horizon, gate),
    captaincy: captaincy(squad, formation, captainId, gate),
    risks: riskFlags(squad, gate),
    structure: structure(squad, formation),
    count: squad.length,
  };
}

/* Best formation for the squad as it stands, scored on the squad's own numbers.
   No external evidence score is invented; when the strategy study lands its evidence rides
   alongside this, it does not replace it. */
export function rankFormations(squad, horizon, gate) {
  return feasibleFormations(squad)
    .map((f) => ({ id: f.id, points: projectedPoints(squad, f.id, horizon, gate).total }))
    .sort((a, b) => b.points - a.points);
}

/* AUTO-COMPLETE — one press fills every remaining slot with the best score affordable while every
   other empty slot stays fillable. Two phases, because a single greedy pass can spend the budget on
   midfielders and then dead-end when the cheapest reserved defender turns out to break the
   three-per-club rule:

     1. fill every empty slot with the cheapest legal player, which always yields a legal 15;
     2. upgrade greedily — take the largest score gain per pound available within the bank, and keep
        going until no affordable improvement remains.

   Players already on the pitch are never replaced: this fills a squad, it does not overrule picks
   that were made deliberately. Deterministic, instant, no AI. */
export function autoComplete(squad, pool) {
  const next = [...squad];
  const seeded = new Set(squad.map((p) => p.id));
  const legalFor = (pos, exclude) => {
    const held = exclude ? next.filter((p) => p.id !== exclude.id) : next;
    return pool.filter((p) => p.position === pos
      && !held.some((x) => x.id === p.id)
      && clubCount(held, p.team_id) < MAX_PER_CLUB
      && (!p.status || p.status === "a"));
  };

  /* Phase 1 — cheapest legal fill. */
  for (const pos of POS_ORDER) {
    while (posCount(next, pos) < COMPOSITION[pos]) {
      const pick = legalFor(pos).sort((a, b) => Number(a.price) - Number(b.price) || a.id - b.id)[0];
      if (!pick) break;
      next.push(pick);
    }
  }

  /* Phase 2 — greedy upgrade on score gained per pound spent, bank permitting. */
  for (let step = 0; step < 200; step++) {
    let best = null;
    for (const out of next) {
      if (seeded.has(out.id)) continue;
      const bank = BUDGET - squadCost(next) + Number(out.price);
      for (const cand of legalFor(out.position, out)) {
        if (Number(cand.price) > bank + 1e-9) continue;
        const gain = Number(cand.score) - Number(out.score);
        if (gain <= 1e-9) continue;
        const spend = Number(cand.price) - Number(out.price);
        const efficiency = spend > 0 ? gain / spend : gain * 1000;
        if (!best || efficiency > best.efficiency + 1e-12) best = { out, cand, efficiency };
      }
    }
    if (!best) break;
    next[next.findIndex((p) => p.id === best.out.id)] = best.cand;
  }

  return next;
}

/* GUIDED MODE — one position group at a time, inside the structure's budget envelope.
   The envelope is the share of the budget that position group historically needs to leave the
   others fillable; computed here from the pool's own price distribution, not asserted. */
export function budgetEnvelope(pool, formation) {
  const shape = { GKP: COMPOSITION.GKP, DEF: COMPOSITION.DEF, MID: COMPOSITION.MID, FWD: COMPOSITION.FWD };
  const cheapest = {};
  for (const pos of POS_ORDER) {
    const prices = pool.filter((p) => p.position === pos).map((p) => Number(p.price)).sort((a, b) => a - b);
    cheapest[pos] = prices.slice(0, shape[pos]).reduce((a, b) => a + b, 0);
  }
  const floor = Object.values(cheapest).reduce((a, b) => a + b, 0);
  const slack = BUDGET - floor;
  const envelope = {};
  for (const pos of POS_ORDER) {
    // slack is offered in proportion to how much price range the position actually has
    const prices = pool.filter((p) => p.position === pos).map((p) => Number(p.price));
    const range = prices.length ? Math.max(...prices) - Math.min(...prices) : 0;
    envelope[pos] = { floor: +cheapest[pos].toFixed(1), range };
  }
  const rangeTotal = POS_ORDER.reduce((s, pos) => s + envelope[pos].range * shape[pos], 0) || 1;
  for (const pos of POS_ORDER) {
    const alloc = (envelope[pos].range * shape[pos]) / rangeTotal;
    envelope[pos].cap = +(envelope[pos].floor + slack * alloc).toFixed(1);
  }
  return envelope;
}

export const GUIDED_STEPS = [
  { pos: "GKP", title: "Goalkeepers", need: COMPOSITION.GKP },
  { pos: "DEF", title: "Defenders", need: COMPOSITION.DEF },
  { pos: "MID", title: "Midfielders", need: COMPOSITION.MID },
  { pos: "FWD", title: "Forwards", need: COMPOSITION.FWD },
];

/* TRANSFER COMPARISON — same-position candidates for an owned player, ranked by the net change
   in squad points over the horizon. Informational only; transfers happen in the official app. */
export function replacementCandidates(out, squad, pool, bank, horizon, gate) {
  const remaining = squad.filter((p) => p.id !== out.id);
  const budget = Number(bank) + Number(out.price);
  return pool
    .filter((p) => p.position === out.position && !squad.some((x) => x.id === p.id))
    .map((p) => {
      const affordable = Number(p.price) <= budget + 1e-9;
      const clubOk = clubCount(remaining, p.team_id) < MAX_PER_CLUB;
      const delta = horizonPoints(Number(p.score) - Number(out.score), horizon);
      return {
        ...p,
        affordable, clubOk, legal: affordable && clubOk,
        delta: +delta.toFixed(1),
        clearsHit: delta + HIT >= params.solver.hit_threshold_points.value,
        bankAfter: +(budget - Number(p.price)).toFixed(1),
      };
    })
    .sort((a, b) => (b.legal - a.legal) || (b.delta - a.delta));
}

export function transferSummary(moves, freeTransfers, horizon) {
  const used = moves.length;
  const hits = Math.max(0, used - freeTransfers) * Math.abs(HIT);
  const gross = moves.reduce((s, m) => s + horizonPoints(Number(m.in.score) - Number(m.out.score), horizon), 0);
  return {
    used, freeTransfers, hits,
    gross: +gross.toFixed(1),
    net: +(gross - hits).toFixed(1),
    threshold: params.solver.hit_threshold_points.value,
    clears: gross - hits >= 0,
  };
}
