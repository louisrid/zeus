// A-07 · Understat season data: player season xG/xA + team xG for.
// Understat stopped embedding teamsData/playersData in the league page HTML, so this reads their
// POST endpoint instead. FPL's own expected_goals/expected_assists (fpl_bootstrap) stays the
// always-on fallback (A-08). teams.xg_against has no public source any more and is left null.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "understat_pull";
const SEASON_URL = process.env.UNDERSTAT_SEASON || "2025"; // understat labels 2025/26 as 2025
const SEASON_TAG = "2025-26";
const ENDPOINT = "https://understat.com/main/getPlayersStats/";

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

export async function fetchPlayers(season = SEASON_URL, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (FPLBot personal project)",
      "Referer": `https://understat.com/league/EPL/${season}`,
    },
    body: new URLSearchParams({ league: "EPL", season: String(season) }).toString(),
  });
  if (!res.ok) throw new Error(`understat ${res.status}`);
  const json = await res.json();
  const players = json && (json.players || (json.response && json.response.players));
  if (!Array.isArray(players) || !players.length) throw new Error("understat endpoint returned no players");
  return players;
}

const ALIAS = { "manchester city": "man city", "manchester united": "man utd", "tottenham": "spurs",
  "nottingham forest": "nott'm forest", "newcastle united": "newcastle", "wolverhampton wanderers": "wolves",
  "brighton": "brighton", "west ham": "west ham", "leeds": "leeds" };
const norm = (n) => { const l = (n || "").toLowerCase(); return ALIAS[l] || l; };
const n3 = (v) => +Number(v || 0).toFixed(3);


export function matchUnderstatPlayers({ currentPlayers = [], understatPlayers = [], teamById = new Map() }) {
  const rows = [];
  const used = new Set();
  for (const p of currentPlayers) {
    const team = teamById.get(p.team_id) || {};
    const player = { ...p, team_name: team.name, short_name: team.short_name };
    const u = matchExpectedMetricsRow({ player, source: understatPlayers });
    if (!u || used.has(u)) continue;
    used.add(u);
    rows.push({
      player_id: p.id, season: SEASON_TAG, competition: "PL",
      games: +u.games, minutes: +u.time, shots: +u.shots, key_passes: +u.key_passes,
      xg: n3(u.xG), xa: n3(u.xA), npxg: n3(u.npxG),
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

// team xG for = sum of its players' xG. xG against is not derivable from this payload.
export function teamXgFor(players) {
  const totals = new Map();
  for (const p of players) {
    // transferred players arrive as "Chelsea,Everton" — attribute the season xG to the current club.
    const clubs = String(p.team_title || "").split(",").map((c) => c.trim()).filter(Boolean);
    const key = norm(clubs[clubs.length - 1]);
    if (!key) continue;
    totals.set(key, (totals.get(key) || 0) + Number(p.xG || 0));
  }
  return totals;
}

async function main() {
  const players = await fetchPlayers();

  const { data: tRows } = await supabase.from("teams").select("id, name, short_name");
  const tId = {}; for (const t of tRows) tId[norm(t.name)] = t.id;
  let teamHits = 0;
  for (const [key, xgFor] of teamXgFor(players)) {
    const id = tId[key];
    if (!id) continue;
    await supabase.from("teams").update({
      xg_for: +xgFor.toFixed(2), understat_updated: new Date().toISOString(),
    }).eq("id", id);
    teamHits++;
  }

  // Live players only. Match with ids, full names, initials, surnames and team aliases.
  // Exact-name-only matching discarded established players such as Bruno Fernandes whenever
  // FPL and Understat used different display names, forcing the projection engine onto a generic
  // positional attacking rate.
  const { data: pRows } = await supabase.from("players")
    .select("id, fpl_id, team_id, name, web_name")
    .not("archive", "is", true);
  const teamById = new Map((tRows || []).map((t) => [t.id, t]));
  const rows = matchUnderstatPlayers({ currentPlayers: pRows || [], understatPlayers: players, teamById });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("understat_player_season").upsert(rows.slice(i, i + 500), { onConflict: "player_id,season,competition" });
    if (error) throw new Error("understat_player_season: " + error.message);
  }
  const msg = `teams ${teamHits} · players matched ${rows.length} of ${players.length} · xg_against unavailable (no public source)`;
  await beat("ok", msg);
  console.log("understat: " + msg);
}
// Only run when executed directly.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });