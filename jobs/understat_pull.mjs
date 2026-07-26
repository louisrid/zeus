// A-07 · Understat season data: player season xG/xA + team xG for.
// Understat stopped embedding teamsData/playersData in the league page HTML, so this reads their
// POST endpoint instead. FPL's own expected_goals/expected_assists (fpl_bootstrap) stays the
// always-on fallback (A-08). teams.xg_against has no public source any more and is left null.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
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

  const { data: tRows } = await supabase.from("teams").select("id, name");
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

  // Live players only. A relegated-club player from the archive can share a name with a current
  // player, and the name lookup would then write this season's data against the wrong row.
  const { data: pRows } = await supabase.from("players").select("id, name, web_name").not("archive", "is", true);
  const pByName = {};
  for (const p of pRows) { pByName[p.name.toLowerCase()] = p.id; pByName[p.web_name.toLowerCase()] = p.id; }
  const byKey = new Map();
  for (const u of players) {
    const id = pByName[(u.player_name || "").toLowerCase()];
    if (!id) continue;
    byKey.set(id, {
      player_id: id, season: SEASON_TAG, competition: "PL",
      games: +u.games, minutes: +u.time, shots: +u.shots, key_passes: +u.key_passes,
      xg: n3(u.xG), xa: n3(u.xA), npxg: n3(u.npxG),
      updated_at: new Date().toISOString(),
    });
  }
  const rows = [...byKey.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("understat_player_season").upsert(rows.slice(i, i + 500), { onConflict: "player_id,season,competition" });
    if (error) throw new Error("understat_player_season: " + error.message);
  }
  const msg = `teams ${teamHits} · players matched ${rows.length} of ${players.length} · xg_against unavailable (no public source)`;
  await beat("ok", msg);
  console.log("understat: " + msg);
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
