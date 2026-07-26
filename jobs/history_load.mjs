// B-00 · Multi-season training set. Loads every usable season of the open FPL dataset into
// history_player_gw. One-shot, re-runnable: rows are upserted on (season, gw, player_name, element).
//
// Notes that matter for anyone changing this:
//  - Seasons 2016/17 to 2019/20 have no `position` or `team` column. Position is recovered from
//    that season's players_raw.csv via the element id. Team is left null for those seasons.
//  - The dataset labels goalkeepers `GK`, not `GKP`, and 2024/25 contains a stray `AM` label.
//    Both are normalised here. Failing to normalise silently drops all goalkeepers.
//  - `starts` does not exist before 2022/23. minutes >= 60 is the proxy, which agrees with the
//    real flag 94.7% of the time where both exist.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "history_load";
const BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data";
const SEASONS = (process.env.HISTORY_SEASONS ||
  "2016-17,2017-18,2018-19,2019-20,2020-21,2021-22,2022-23,2023-24,2024-25,2025-26").split(",");
const NEEDS_POSITION_MAP = new Set(["2016-17", "2017-18", "2018-19", "2019-20"]);
const ELEMENT_TYPE = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
const NORM = { GK: "GKP", GKP: "GKP", DEF: "DEF", MID: "MID", FWD: "FWD", AM: "MID" };

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

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
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "FPLBot history load (personal project)" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

export function normalisePosition(raw) {
  return NORM[String(raw || "").toUpperCase()] || null;
}

// Name formats differ by era: "Aaron_Cresswell" in 2016/17, "Aaron_Cresswell_376" in 2019/20,
// "Nathan Redmond" from 2022/23. Without normalising, the same player cannot be joined across
// seasons and every career view silently splits into fragments.
export function normaliseName(raw) {
  return String(raw || "")
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapRow(season, r, positionMap) {
  const raw = r.position || (positionMap ? positionMap[r.element] : null);
  const position = normalisePosition(raw);
  if (!position) return null;
  const minutes = int(r.minutes) ?? 0;
  const startsCol = r.starts;
  const started = startsCol === undefined || startsCol === "" ? minutes >= 60 : int(startsCol) === 1;
  return {
    season, competition: "PL", gw: int(r.GW), element: int(r.element),
    player_name: normaliseName(r.name), position, team: r.team || null,
    opponent_team: int(r.opponent_team), was_home: r.was_home === "True" || r.was_home === "true",
    minutes, started, total_points: int(r.total_points),
    goals: int(r.goals_scored), assists: int(r.assists),
    clean_sheets: int(r.clean_sheets), goals_conceded: int(r.goals_conceded), saves: int(r.saves),
    yellow: int(r.yellow_cards), red: int(r.red_cards), own_goals: int(r.own_goals),
    pens_missed: int(r.penalties_missed), pens_saved: int(r.penalties_saved),
    bps: int(r.bps), bonus: int(r.bonus),
    xg: num(r.expected_goals), xa: num(r.expected_assists),
    defcon: int(r.defensive_contribution),
    price: num(r.value) === null ? null : num(r.value) / 10,
    kickoff_utc: r.kickoff_time || null,
  };
}

async function main() {
  const report = [];
  let grand = 0;

  for (const season of SEASONS) {
    let positionMap = null;
    if (NEEDS_POSITION_MAP.has(season)) {
      const raw = parseCsv(await get(`${BASE}/${season}/players_raw.csv`));
      positionMap = {};
      for (const p of raw) positionMap[p.id] = ELEMENT_TYPE[Number(p.element_type)];
    }

    let text;
    try {
      text = await get(`${BASE}/${season}/gws/merged_gw.csv`);
    } catch (e) {
      report.push(`${season} EXCLUDED (${e.message})`);
      continue;
    }

    const raw = parseCsv(text);
    const rows = [];
    let dropped = 0;
    for (const r of raw) {
      const m = mapRow(season, r, positionMap);
      if (!m || !m.player_name || m.gw === null) { dropped++; continue; }
      rows.push(m);
    }

    // De-duplicate on (season, gw, element). element is the FPL id within a season and never
    // changes, whereas player_name did when normalisation was added, which silently doubled the
    // table on the second run. Never key this on a name.
    const byKey = new Map();
    for (const r of rows) byKey.set(`${r.season}|${r.gw}|${r.element ?? r.player_name}`, r);
    const deduped = [...byKey.values()];

    for (let i = 0; i < deduped.length; i += 500) {
      const { error } = await supabase.from("history_player_gw")
        .upsert(deduped.slice(i, i + 500), { onConflict: "season,gw,element" });
      if (error) throw new Error(`${season}: ${error.message}`);
    }
    grand += deduped.length;
    report.push(`${season} ${deduped.length}${dropped ? ` (${dropped} dropped)` : ""}`);
    console.log(`${season}: ${deduped.length} rows loaded${dropped ? `, ${dropped} dropped` : ""}`);
  }

  const msg = `${grand} player-gameweeks · ${report.join(" · ")}`;
  await beat("ok", msg);
  console.log(`HISTORY LOAD — ${msg}`);
}
// Only run when executed directly. Importing this module for its pure helpers must not start a run.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
