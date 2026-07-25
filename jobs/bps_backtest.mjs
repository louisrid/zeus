// A-11 · BPS backtest: engine vs actual BPS + bonus across the 2025/26 archive.
// Writes calibration_metrics + a heartbeat summary. Runs after archive_2526 has loaded.
import { createClient } from "@supabase/supabase-js";
import { bpsFor, allocateBonus } from "../lib/bps_engine.mjs";
import { readFileSync } from "fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "bps_backtest";
const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}
async function main() {
  const { data: players } = await supabase.from("players").select("id, position");
  const posOf = Object.fromEntries(players.map((p) => [p.id, p.position]));
  let from = 0, all = [];
  while (true) {
    const { data, error } = await supabase.from("player_match_stats").select("*").eq("source", "vaastav")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  if (!all.length) throw new Error("archive empty — run archive_2526 first");

  const played = all.filter((s) => (s.minutes || 0) > 0 && s.bps !== null);
  let mae = 0, n = 0;
  const byFixture = new Map();
  for (const s of played) {
    const pred = bpsFor(s, posOf[s.player_id] || "MID", rules);
    mae += Math.abs(pred - s.bps); n++;
    if (!byFixture.has(s.fixture_id)) byFixture.set(s.fixture_id, []);
    byFixture.get(s.fixture_id).push({ key: s.player_id, bps: pred, actualBps: s.bps, actualBonus: s.bonus || 0 });
  }
  mae /= n;

  let bonusExact = 0, bonusPlayers = 0, top3Hit = 0, top3Total = 0;
  for (const [, list] of byFixture) {
    const alloc = allocateBonus(list);
    for (const p of list) {
      const predBonus = alloc.get(p.key) || 0;
      if (predBonus === p.actualBonus) bonusExact++;
      bonusPlayers++;
      if (p.actualBonus > 0) { top3Total++; if (predBonus > 0) top3Hit++; }
    }
  }
  const metrics = [
    { metric: "bps_mae", value: +mae.toFixed(3) },
    { metric: "bonus_exact_rate", value: +(bonusExact / bonusPlayers).toFixed(4) },
    { metric: "bonus_top3_recall", value: +(top3Hit / top3Total).toFixed(4) },
    { metric: "bps_backtest_matches", value: byFixture.size },
  ];
  for (const m of metrics) {
    const { error } = await supabase.from("calibration_metrics").insert({
      model_version: "bps_engine_v1", component: "bps", metric: m.metric, value: m.value,
      window: "2025-26", computed_at: new Date().toISOString(),
    });
    if (error) throw new Error("calibration_metrics: " + error.message);
  }
  const msg = `MAE ${mae.toFixed(2)} · bonus exact ${(100 * bonusExact / bonusPlayers).toFixed(1)}% · top3 recall ${(100 * top3Hit / top3Total).toFixed(1)}% · ${byFixture.size} matches`;
  await beat("ok", msg);
  console.log("BPS BACKTEST — " + msg);
  console.log("Known v1 gaps (quantified above, flagged per rules JSON): pass-completion, big chances, crosses, errors, winning-goal, defender-conceded rows not in archive.");
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
