import { loadForServer } from "../../../lib/server/load.mjs";
import { buildExactSquadForRange } from "../../../lib/server/exact-range-optimiser.mjs";
import { parseMinimumBenchSpend } from "../../../lib/minimum-bench-spend.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ids = (value) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isFinite))];
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function POST(request) {
  try {
    const body = await request.json();
    const gwFrom = Number(body?.gw_from);
    const gwTo = Number(body?.gw_to);
    const budget = finite(body?.budget, 100);
    const minimumResult = parseMinimumBenchSpend(body, {
      budget,
      required: false,
      defaultValue: 16.5,
    });
    if (!minimumResult.ok) return Response.json(minimumResult, { status: 400 });
    const minimumBenchSpend = minimumResult.value;
    const chipSchedule = body?.chip_schedule && typeof body.chip_schedule === "object" ? body.chip_schedule : {};
    const transferHits = body?.transfer_hits && typeof body.transfer_hits === "object" ? body.transfer_hits : {};
    const loaded = await loadForServer();
    const { players, scorer } = loaded;
    const pool = players.filter((player) => Number(player.price) > 0);
    const startProbOf = (player) => scorer.startProbForGw
      ? scorer.startProbForGw(player, gwFrom)
      : (scorer.startProbOf ? scorer.startProbOf(player) : null);
    const result = await buildExactSquadForRange({
      pool,
      scoreForGw: (player, gw) => scorer.scoreForGw ? scorer.scoreForGw(player, gw) : 0,
      gwFrom,
      gwTo,
      chipForGw: (gw) => chipSchedule[gw] || chipSchedule[String(gw)] || null,
      transferHitForGw: (gw) => finite(transferHits[gw] ?? transferHits[String(gw)], 0),
      locks: ids(body?.locks),
      keep: ids(body?.keep),
      ignores: ids(body?.ignores),
      budget,
      benchBudget: minimumBenchSpend,
      maxPerClub: 3,
      startProbOf,
      minStart: 0.55,
      onlyFormation: body?.only_formation || null,
    });
    if (!result.ok) return Response.json(result, { status: 422 });
    if (result.solver?.status !== "OPTIMAL" || result.solver?.optimality_proven !== true || result.solver?.mip_gap !== 0) {
      return Response.json({ ok: false, error: "The exact optimiser did not prove global optimality." }, { status: 422 });
    }
    return Response.json({
      ...result,
      minimum_bench_spend: minimumBenchSpend,
      minimum_bench_spend_enabled: minimumBenchSpend > 0,
      bench_spend_rule: "at_least",
      bench_spend_can_exceed_minimum: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
