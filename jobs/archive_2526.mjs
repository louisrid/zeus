// A-06 · 2025/26 per-match archive from the public vaastav dataset → player_match_stats.
// One-shot job (workflow_dispatch). Archive fixtures get season '2025-26' and offset fpl_ids.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

let _db = null;
const supabaseClient = () => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
};
const JOB = "archive_2526";
const SRC = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26/gws/merged_gw.csv";
const OFFSET = 1000000;

async function beat(status, message) {
  await supabaseClient().from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

// small CSV parser (handles quoted fields with commas)
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

async function main() {
  const text = await fetch(SRC).then((r) => { if (!r.ok) throw new Error(`csv ${r.status}`); return r.text(); });
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("empty archive csv");

  const { data: teamRows } = await supabaseClient().from("teams").select("id, name, short_name");
  const teamByName = {};
  for (const t of teamRows) teamByName[t.name.toLowerCase()] = t.id;
  const ALIAS = { "man city": "manchester city", "man utd": "manchester united", "spurs": "tottenham hotspur",
    "nott'm forest": "nottingham forest", "newcastle": "newcastle united", "wolves": "wolverhampton wanderers",
    "brighton": "brighton and hove albion", "west ham": "west ham united", "leeds": "leeds united" };
  const findTeam = (name) => {
    const n = (name || "").toLowerCase();
    return teamByName[n] || teamByName[ALIAS[n]] || null;
  };
  // create archive team rows for clubs no longer in the league
  const missing = [...new Set(rows.map((r) => r.team).filter((n) => n && !findTeam(n)))];
  for (let i = 0; i < missing.length; i++) {
    const { data } = await supabaseClient().from("teams")
      .insert({ fpl_id: OFFSET + i + 1, name: missing[i], short_name: missing[i].slice(0, 3).toUpperCase(), archive: true })
      .select("id").single();
    if (data) teamByName[missing[i].toLowerCase()] = data.id;
  }

  // players: match by exact full name to current, else create archive player rows
  const { data: pRows } = await supabaseClient().from("players").select("id, name");
  const playerByName = Object.fromEntries(pRows.map((p) => [p.name.toLowerCase(), p.id]));
  const POSN = { GK: "GKP", GKP: "GKP", DEF: "DEF", MID: "MID", FWD: "FWD" };
  const unknown = new Map();
  for (const r of rows) {
    const key = (r.name || "").toLowerCase();
    if (!playerByName[key] && !unknown.has(key)) unknown.set(key, r);
  }
  let created = 0;
  for (const [key, r] of unknown) {
    const { data, error } = await supabaseClient().from("players").insert({
      fpl_id: OFFSET + created + 1, name: r.name, web_name: r.name.split(" ").slice(-1)[0],
      team_id: findTeam(r.team), position: POSN[r.position] || "MID", archive: true,
    }).select("id").single();
    if (error) throw new Error("archive player: " + error.message);
    playerByName[key] = data.id; created++;
  }

  // archive fixtures: one per vaastav fixture id
  const fixtureIds = [...new Set(rows.map((r) => num(r.fixture)).filter(Boolean))];
  const { data: existingFx } = await supabaseClient().from("fixtures").select("id, fpl_id").gte("fpl_id", OFFSET);
  const fxByFpl = Object.fromEntries((existingFx || []).map((f) => [f.fpl_id, f.id]));
  for (const fid of fixtureIds) {
    if (fxByFpl[OFFSET + fid]) continue;
    const any = rows.find((r) => num(r.fixture) === fid);
    const teamA = findTeam(any.team);
    const opp = num(any.opponent_team); // vaastav uses 2025/26 team index — resolvable only via team name of opponent rows; store null when unknown
    const { data, error } = await supabaseClient().from("fixtures").insert({
      fpl_id: OFFSET + fid, gw: num(any.GW), season: "2025-26",
      home_team: any.was_home === "True" ? teamA : null, away_team: any.was_home === "True" ? null : teamA,
      kickoff_utc: any.kickoff_time || null, finished: true,
    }).select("id").single();
    if (error) throw new Error("archive fixture: " + error.message);
    fxByFpl[OFFSET + fid] = data.id;
  }

  // player_match_stats
  const stats = rows.map((r) => ({
    player_id: playerByName[(r.name || "").toLowerCase()],
    fixture_id: fxByFpl[OFFSET + num(r.fixture)],
    minutes: num(r.minutes), goals: num(r.goals_scored), assists: num(r.assists),
    xg: num(r.expected_goals), xa: num(r.expected_assists),
    saves: num(r.saves), goals_conceded: num(r.goals_conceded),
    clearances_blocks_interceptions: num(r.clearances_blocks_interceptions),
    tackles: num(r.tackles), recoveries: num(r.recoveries),
    defcon_points: num(r.defensive_contribution),
    yellow: num(r.yellow_cards), red: num(r.red_cards), own_goals: num(r.own_goals),
    pens_missed: num(r.penalties_missed), pens_saved: num(r.penalties_saved),
    bps: num(r.bps), bonus: num(r.bonus), total_points: num(r.total_points),
    started: num(r.starts) === 1, source: "vaastav",
  })).filter((s) => s.player_id && s.fixture_id);
  const byKey = new Map();
  for (const s of stats) byKey.set(s.player_id + ":" + s.fixture_id, s);
  const deduped = [...byKey.values()];
  for (let i = 0; i < deduped.length; i += 500) {
    const { error } = await supabaseClient().from("player_match_stats").upsert(deduped.slice(i, i + 500), { onConflict: "player_id,fixture_id" });
    if (error) throw new Error("pms: " + error.message);
  }
  const collapsed = stats.length - deduped.length;
  await beat("ok", `rows ${deduped.length} · archive players ${created} · fixtures ${fixtureIds.length} · dupes ${collapsed}`);
  console.log(`archive loaded: ${deduped.length} player-matches (${collapsed} duplicate keys collapsed)`);
}
// Only run when executed directly.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
