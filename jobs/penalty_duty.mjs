// C-13a · PENALTY DUTY, DERIVED FROM HISTORY.
//
// No scraper. A missed penalty is recorded in the open dataset and is proof that the player was on
// penalties. Scored penalties are not separable from other goals in that data, so this identifies
// takers with certainty and under-counts them. Confidence records exactly that: a player with
// several missed penalties across seasons is near-certain, one with a single miss is likely.
//
// What this does NOT do: corners and free kicks. Neither leaves a trace in the dataset, so they
// still need a source that does not exist. That stays ticketed rather than guessed.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "penalty_duty";
const RECENT_SEASONS = (process.env.PENALTY_SEASONS || "2022-23,2023-24,2024-25,2025-26").split(",");

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

async function pageAll(table, select, apply) {
  let from = 0, all = [];
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return all;
}

/* Confidence from the weight of evidence. Recency matters: duty moves between seasons. */
export function confidenceFor(misses, seasons, latestSeason) {
  const recency = latestSeason === RECENT_SEASONS[RECENT_SEASONS.length - 1] ? 1 : 0.7;
  const weight = Math.min(1, 0.55 + 0.15 * (misses - 1) + 0.1 * (seasons - 1));
  return Math.round(weight * recency * 100) / 100;
}

async function main() {
  const rows = await pageAll("history_player_gw", "season, player_name, pens_missed",
    (q) => q.in("season", RECENT_SEASONS).gt("pens_missed", 0));
  if (!rows.length) throw new Error("no missed penalties found; run history-load first");

  const byName = new Map();
  for (const r of rows) {
    const a = byName.get(r.player_name) || { misses: 0, seasons: new Set() };
    a.misses += Number(r.pens_missed) || 0;
    a.seasons.add(r.season);
    byName.set(r.player_name, a);
  }

  // Match to live players only. Archive players cannot take a penalty this season.
  const players = await pageAll("players", "id, name, web_name, team_id", (q) => q.not("archive", "is", true));
  const byKey = new Map();
  for (const p of players) {
    byKey.set(p.name.toLowerCase(), p);
    if (!byKey.has(p.web_name.toLowerCase())) byKey.set(p.web_name.toLowerCase(), p);
  }

  const out = [];
  let unmatched = 0;
  for (const [name, a] of byName) {
    const p = byKey.get(String(name).toLowerCase());
    if (!p) { unmatched += 1; continue; }
    const latest = [...a.seasons].sort().pop();
    out.push({
      team_id: p.team_id, player_id: p.id, kind: "pen", source: "observed", rank: 1,
      confidence: confidenceFor(a.misses, a.seasons.size, latest),
      evidence: `${a.misses} missed penalt${a.misses === 1 ? "y" : "ies"} across ${a.seasons.size} season${a.seasons.size === 1 ? "" : "s"}, latest ${latest}`,
      derived_from: "history_player_gw.pens_missed",
      updated_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < out.length; i += 500) {
    const { error } = await supabase.from("set_piece_duty")
      .upsert(out.slice(i, i + 500), { onConflict: "team_id,player_id,kind" });
    if (error) throw new Error("set_piece_duty: " + error.message);
  }

  const msg = `${out.length} penalty takers derived · ${unmatched} historical names not in the current squad · corners and free kicks still have no source`;
  await beat("ok", msg);
  console.log("PENALTY DUTY");
  console.log(`  ${out.length} current players identified as penalty takers`);
  console.log(`  ${unmatched} historical takers are no longer in the league`);
  console.log("  corners and free kicks leave no trace in the dataset and remain unsourced");
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
