// A-06 · 2025/26 per-match archive from the public vaastav dataset → player_match_stats.
// One-shot job (workflow_dispatch). Archive fixtures get season '2025-26' and offset fpl_ids.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { matchExpectedMetricsRow, normalisePlayerText, normaliseTeamText } from "../lib/engine/player_data_matcher.mjs";
import { archiveFixtureUpsert } from "../lib/fixture_rows.mjs";

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

  // players: conservative full-name/team matching to current players, then archive rows for
  // genuinely absent footballers. Exact-name-only matching split players such as Bruno Fernandes
  // into an archive duplicate and removed their expected metrics from the live engine.
  const { data: pRows } = await supabaseClient().from("players")
    .select("id, fpl_id, team_id, name, web_name, archive");
  const currentPlayers = (pRows || []).filter((p) => !p.archive).map((p) => ({
    ...p,
    team_name: (teamRows || []).find((t) => t.id === p.team_id)?.name,
    short_name: (teamRows || []).find((t) => t.id === p.team_id)?.short_name,
  }));
  const rawKey = (r) => `${normalisePlayerText(r.name || r.player_name)}|${normaliseTeamText(r.team || r.team_title)}`;
  const rawPeople = [...new Map(rows.map((r) => [rawKey(r), {
    name: r.name, player_name: r.name, team: r.team, team_title: r.team, position: r.position,
  }])).values()];
  const playerByRawKey = new Map();
  const usedRaw = new Set();
  for (const p of currentPlayers) {
    const match = matchExpectedMetricsRow({ player: p, source: rawPeople });
    if (!match || usedRaw.has(match)) continue;
    usedRaw.add(match);
    playerByRawKey.set(rawKey(match), p.id);
  }
  for (const p of (pRows || []).filter((x) => x.archive)) {
    const key = `${normalisePlayerText(p.name)}|`;
    if (![...playerByRawKey.keys()].some((k) => k.startsWith(key))) {
      const raw = rawPeople.find((r) => normalisePlayerText(r.name) === normalisePlayerText(p.name));
      if (raw) playerByRawKey.set(rawKey(raw), p.id);
    }
  }
  const POSN = { GK: "GKP", GKP: "GKP", DEF: "DEF", MID: "MID", FWD: "FWD" };
  let created = 0;
  for (const r of rawPeople) {
    const key = rawKey(r);
    if (playerByRawKey.has(key)) continue;
    const { data, error } = await supabaseClient().from("players").insert({
      fpl_id: OFFSET + created + 1, name: r.name, web_name: r.name.split(" ").slice(-1)[0],
      team_id: findTeam(r.team), position: POSN[r.position] || "MID", archive: true,
    }).select("id").single();
    if (error) throw new Error("archive player: " + error.message);
    playerByRawKey.set(key, data.id); created++;
  }

  // archive fixtures: one per vaastav fixture id
  const fixtureIds = [...new Set(rows.map((r) => num(r.fixture)).filter(Boolean))];
  const { data: existingFx } = await supabaseClient().from("fixtures")
    .select("id, fpl_id, gw, home_team, away_team, home_goals, away_goals, kickoff_utc, finished, season, competition")
    .gte("fpl_id", OFFSET);
  const fxByFpl = Object.fromEntries((existingFx || []).map((f) => [f.fpl_id, f.id]));
  const existingByFpl = new Map((existingFx || []).map((fixture) => [Number(fixture.fpl_id), fixture]));
  for (const fid of fixtureIds) {
    const fxRows = rows.filter((r) => num(r.fixture) === fid);
    const any = fxRows[0];
    // Both sides come from the rows themselves: every fixture has players from both clubs, and
    // was_home says which is which. Storing one side is what broke every opponent tag in the app.
    const homeName = (fxRows.find((r) => r.was_home === "True") || {}).team;
    const awayName = (fxRows.find((r) => r.was_home !== "True") || {}).team;
    // Scoreline: goals conceded by one side is goals scored by the other, and it already includes
    // own goals, which is why summing goals_scored disagreed with it.
    const concededBy = (name) => {
      const r = fxRows.find((x) => x.team === name && num(x.minutes) > 0);
      return r ? num(r.goals_conceded) : null;
    };
    const candidate = {
      fpl_id: OFFSET + fid, gw: num(any.GW), season: "2025-26",
      competition: "PL",
      home_team: homeName ? findTeam(homeName) : null,
      away_team: awayName ? findTeam(awayName) : null,
      home_goals: awayName ? concededBy(awayName) : null,
      away_goals: homeName ? concededBy(homeName) : null,
      kickoff_utc: any.kickoff_time || null, finished: true,
    };
    const repair = archiveFixtureUpsert(existingByFpl.get(OFFSET + fid), candidate);
    const { data, error } = await supabaseClient().from("fixtures")
      .upsert(repair.row, { onConflict: "fpl_id" }).select("id").single();
    if (error) throw new Error("archive fixture: " + error.message);
    fxByFpl[OFFSET + fid] = data.id;
    existingByFpl.set(OFFSET + fid, { ...repair.row, id: data.id });
  }

  // player_match_stats
  const stats = rows.map((r) => ({
    player_id: playerByRawKey.get(rawKey(r)),
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
