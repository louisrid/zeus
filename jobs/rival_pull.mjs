// B-17 / B-09 · TOP-RANK SQUADS AND EFFECTIVE OWNERSHIP.
//
// The template alignment band needs to know what good managers actually own, not just what everyone
// owns. This reads it from the official API rather than scraping anything: the overall classic league
// (id 314) ranks every manager, and each entry's picks are public once a gameweek has started.
//
// EFFECTIVE OWNERSHIP, not ownership. A player captained by half his owners counts for more than his
// ownership suggests, because the armband doubles him. EO = (starters + captains) / managers, so a
// player owned by 60% and captained by 20% has EO of 80%. That is the number that decides whether
// owning him protects your rank or moves it.
//
// SCOPES. 'overall' is FPL's own global ownership. 'top10k_proxy' and 'top1k_proxy' are computed from
// the sample this job pulls, and they are named proxy because a sample of a few hundred is not the
// whole top 10k. The naming is deliberate so nobody later mistakes it for a census.
//
// PRE-SEASON. Picks do not exist until a gameweek has started. The job says so and exits cleanly
// rather than writing an empty snapshot.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

// Lazy client. Creating it at import time makes the module untestable, because a test importing
// the pure functions would need live credentials.
let _db = null;
const supabaseClient = () => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
};
const JOB = "rival_pull";
const FPL = "https://fantasy.premierleague.com/api";
const OVERALL_LEAGUE = 314;
const PAGES = Number(process.env.RIVAL_PAGES || 4);        // 50 managers per page
const CONCURRENCY = 4;                                     // gentle on the official API

async function beat(status, message) {
  await supabaseClient().from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

const get = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store" });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};

/* Run a list of async tasks a few at a time, so the official API is not hammered. */
export async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      try { out.push(await fn(items[idx])); } catch { /* one bad entry must not fail the run */ }
    }
  });
  await Promise.all(workers);
  return out;
}

/* Effective ownership over a set of squads.
     EO(player) = (managers starting him + managers captaining him) / managers
   A triple captain counts as two extra, matching how the points actually multiply. */
export function effectiveOwnership(squads) {
  const managers = squads.length;
  if (!managers) return new Map();
  const tally = new Map();
  for (const s of squads) {
    const chipMultiplier = s.chip === "3xc" ? 2 : 1;
    for (const pick of s.picks || []) {
      if (pick.multiplier === 0) continue;              // benched, not effective ownership
      const extra = pick.is_captain ? chipMultiplier : 0;
      tally.set(pick.element, (tally.get(pick.element) || 0) + 1 + extra);
    }
  }
  const out = new Map();
  for (const [element, count] of tally) out.set(element, count / managers);
  return out;
}

async function main() {
  const bootstrap = await get(`${FPL}/bootstrap-static/`);
  const current = (bootstrap.events || []).filter((e) => e.finished || e.is_current).pop();
  if (!current) {
    await beat("ok", "no gameweek has started yet, so no squads are published; nothing written");
    console.log("RIVAL PULL — pre-season, picks are not published until a gameweek starts. Nothing written.");
    return;
  }
  const gw = current.id;

  // Ranked entries from the overall league, best first.
  const entries = [];
  for (let page = 1; page <= PAGES; page++) {
    const data = await get(`${FPL}/leagues-classic/${OVERALL_LEAGUE}/standings/?page_standings=${page}`);
    const results = (data.standings && data.standings.results) || [];
    for (const r of results) entries.push({ entry: r.entry, rank: r.rank });
    if (!results.length || !(data.standings && data.standings.has_next)) break;
  }
  if (!entries.length) throw new Error("the overall league returned no entries");

  const squads = await pool(entries, CONCURRENCY, async (e) => {
    const picks = await get(`${FPL}/entry/${e.entry}/event/${gw}/picks/`);
    return { entry_id: e.entry, rank: e.rank, picks: picks.picks || [], chip: picks.active_chip || null };
  });
  if (!squads.length) throw new Error("no squads could be read");

  const rows = squads.map((s) => ({
    gw, entry_id: s.entry_id, rank: s.rank,
    picks: s.picks, chip: s.chip, captured_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseClient().from("rival_squads").upsert(rows.slice(i, i + 200), { onConflict: "gw,entry_id" });
    if (error) throw new Error("rival_squads: " + error.message);
  }

  // Map FPL element ids to our player ids, live players only.
  const { data: players } = await supabaseClient().from("players").select("id, fpl_id").not("archive", "is", true);
  const idByFpl = new Map((players || []).map((p) => [p.fpl_id, p.id]));

  const scopes = [
    ["top1k_proxy", squads.filter((s) => s.rank <= 1000)],
    ["top10k_proxy", squads.filter((s) => s.rank <= 10000)],
  ];
  const eoRows = [];
  for (const [scope, set] of scopes) {
    if (!set.length) continue;
    for (const [element, eo] of effectiveOwnership(set)) {
      const pid = idByFpl.get(element);
      if (!pid) continue;
      eoRows.push({ gw, scope, player_id: pid, eo: Number(eo.toFixed(4)), captured_at: new Date().toISOString() });
    }
  }
  // FPL's own global ownership, which is a census rather than a sample.
  for (const el of bootstrap.elements || []) {
    const pid = idByFpl.get(el.id);
    if (!pid) continue;
    eoRows.push({ gw, scope: "overall", player_id: pid,
      eo: Number((Number(el.selected_by_percent) / 100).toFixed(4)), captured_at: new Date().toISOString() });
  }
  for (let i = 0; i < eoRows.length; i += 500) {
    const { error } = await supabaseClient().from("eo_snapshots").upsert(eoRows.slice(i, i + 500), { onConflict: "gw,scope,player_id" });
    if (error) throw new Error("eo_snapshots: " + error.message);
  }

  const msg = `GW${gw} · ${squads.length} ranked squads · ${eoRows.length} effective-ownership rows across ${scopes.filter(([, s]) => s.length).length + 1} scopes`;
  await beat("ok", msg);
  console.log(`RIVAL PULL — ${msg}`);
}
// Only run when executed directly. Importing this module for its pure helpers must not start a run.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
