// A-07 · Understat season data: team xG environments + player season xG/xA.
// FPL's own expected_goals/expected_assists (captured in fpl_bootstrap) are the always-on fallback (A-08).
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "understat_pull";
const SEASON_URL = process.env.UNDERSTAT_SEASON || "2025"; // understat labels 2025/26 as 2025
const SEASON_TAG = "2025-26";

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}
export function extractJson(html, varName) {
  const re = new RegExp(varName + String.raw`\s*=\s*JSON\.parse\('([\s\S]*?)'\)`);
  const m = html.match(re);
  if (!m) return null;
  const unescaped = m[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  return JSON.parse(unescaped);
}
const ALIAS = { "manchester city": "man city", "manchester united": "man utd", "tottenham": "spurs",
  "nottingham forest": "nott'm forest", "newcastle united": "newcastle", "wolverhampton wanderers": "wolves",
  "brighton": "brighton", "west ham": "west ham", "leeds": "leeds" };
const norm = (n) => { const l = (n || "").toLowerCase(); return ALIAS[l] || l; };

async function main() {
  const html = await fetch(`https://understat.com/league/EPL/${SEASON_URL}`, {
    headers: { "User-Agent": "Mozilla/5.0 (FPLBot personal project)" },
  }).then((r) => { if (!r.ok) throw new Error(`understat ${r.status}`); return r.text(); });

  const teamsData = extractJson(html, "teamsData");
  const playersData = extractJson(html, "playersData");
  if (!teamsData || !playersData) throw new Error("understat payload not found in page");

  const { data: tRows } = await supabase.from("teams").select("id, name");
  const tId = {}; for (const t of tRows) tId[norm(t.name)] = t.id;
  let teamHits = 0;
  for (const key of Object.keys(teamsData)) {
    const t = teamsData[key];
    const id = tId[norm(t.title)];
    if (!id) continue;
    const xgFor = t.history.reduce((s, m) => s + Number(m.xG), 0);
    const xgAgainst = t.history.reduce((s, m) => s + Number(m.xGA), 0);
    await supabase.from("teams").update({
      xg_for: +xgFor.toFixed(2), xg_against: +xgAgainst.toFixed(2), understat_updated: new Date().toISOString(),
    }).eq("id", id);
    teamHits++;
  }

  const { data: pRows } = await supabase.from("players").select("id, name, web_name");
  const pByName = {};
  for (const p of pRows) { pByName[p.name.toLowerCase()] = p.id; pByName[p.web_name.toLowerCase()] = p.id; }
  const rows = [];
  for (const u of playersData) {
    const id = pByName[(u.player_name || "").toLowerCase()];
    if (!id) continue;
    rows.push({
      player_id: id, season: SEASON_TAG,
      games: +u.games, minutes: +u.time, shots: +u.shots, key_passes: +u.key_passes,
      xg: +Number(u.xG).toFixed(3), xa: +Number(u.xA).toFixed(3), npxg: +Number(u.npxG).toFixed(3),
      updated_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("understat_player_season").upsert(rows.slice(i, i + 500), { onConflict: "player_id,season" });
    if (error) throw new Error("understat_player_season: " + error.message);
  }
  await beat("ok", `teams ${teamHits} · players matched ${rows.length}`);
  console.log(`understat: ${teamHits} teams, ${rows.length} players`);
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
