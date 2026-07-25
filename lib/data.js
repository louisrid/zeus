"use client";
import { createClient } from "@supabase/supabase-js";

export const ARCHIVE_OFFSET = 1000000;

let client = null;
export function sb() {
  if (!client) {
    // Single instance app-wide. persistSession off: there is no login, and multiple clients
    // sharing one auth storage key is what produced the GoTrueClient console warning.
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function loadCore() {
  const supabase = sb();
  const [teamsRes, playersRes, gwsRes] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("players").select("*").not("archive", "is", true).order("selected_by_pct", { ascending: false }).limit(1000),
    supabase.from("gameweeks").select("gw, deadline_utc, finished").eq("finished", false).order("gw").limit(1),
  ]);
  if (teamsRes.error || playersRes.error || gwsRes.error) throw new Error("database unreachable");
  const teamById = Object.fromEntries((teamsRes.data || []).map((t) => [t.id, t]));
  const currentGw = gwsRes.data && gwsRes.data[0] ? gwsRes.data[0].gw : 1;
  // ARCHIVE_OFFSET marks rows written by the 2025/26 archive job. Those fixtures store only one
  // side of each match, so they must never reach a surface that resolves an opponent.
  const { data: fixtureRows, error: fe } = await supabase
    .from("fixtures").select("gw, home_team, away_team, kickoff_utc, fpl_id, season")
    .lt("fpl_id", ARCHIVE_OFFSET)
    .not("home_team", "is", null).not("away_team", "is", null)
    .gte("gw", currentGw).lte("gw", currentGw + 7).order("kickoff_utc");
  if (fe) throw new Error("database unreachable");
  const fixtures = fixtureRows || [];
  // Second gate at the read layer. A row with no current club, no position or no price is a data
  // fault, not a player: it is dropped and counted so the status surface can report it.
  const rejected = [];
  const players = (playersRes.data || [])
    .map((p) => ({
      ...p,
      team: teamById[p.team_id] ? teamById[p.team_id].short_name : "—",
      own: p.selected_by_pct === null ? 0 : Number(p.selected_by_pct),
      price: p.price === null ? 0 : Number(p.price),
    }))
    .filter((p) => {
      const club = teamById[p.team_id];
      const ok = club && club.archive !== true && p.position && Number(p.price) > 0;
      if (!ok) rejected.push(p.web_name || p.fpl_id);
      return ok;
    });
  return { players, teamById, fixtures, currentGw, rejected };
}

export function nextFixtures(fixtures, teamById, teamId, n) {
  const out = [];
  for (const f of fixtures) {
    const oppId = f.home_team === teamId ? f.away_team : f.away_team === teamId ? f.home_team : null;
    if (oppId === null) continue;
    const opp = teamById[oppId];
    if (!opp) continue; // unresolvable club: skip rather than render a placeholder
    out.push({ opp: opp.short_name, oppId, home: f.home_team === teamId, gw: f.gw });
    if (out.length >= n) break;
  }
  return out;
}
export const fixLabel = (f) => (f.home ? `${f.opp} (H)` : `${f.opp.toLowerCase()} (A)`);

/* Most-owned legal 15 (2 GK · 5 DEF · 5 MID · 3 FWD by ownership) with a legal most-owned XI first. */
export function templateSquad(players) {
  const take = (pos, n) => players.filter((p) => p.position === pos).slice(0, n);
  const gk = take("GKP", 2), def = take("DEF", 5), mid = take("MID", 5), fwd = take("FWD", 3);
  const outfield = [...def, ...mid, ...fwd].sort((a, b) => b.own - a.own);
  const xi = [gk[0]]; const counts = { DEF: 0, MID: 0, FWD: 0 };
  for (const p of outfield) {
    if (xi.length >= 11) break;
    const key = p.position === "GKP" ? null : p.position;
    const slotsLeft = 11 - xi.length;
    const needDef = Math.max(0, 3 - counts.DEF);
    const needFwd = Math.max(0, 1 - counts.FWD);
    const reserved = (key === "DEF" ? 0 : needDef) + (key === "FWD" ? 0 : needFwd);
    if (slotsLeft - 1 < reserved) continue;
    xi.push(p); counts[key] += 1;
  }
  const rest = [gk[1], ...outfield.filter((p) => !xi.includes(p))].filter(Boolean);
  const bench = rest.slice(0, 4);
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
  xi.sort((a, b) => order[a.position] - order[b.position]);
  return [...xi, ...bench].map((p) => ({ ...p, flag: p.status !== "a" }));
}

/* Fixture swings v1 — INTERIM: FPL team strength until odds-implied lands. */
export function fixtureSwings(fixtures, teamById, currentGw) {
  const teams = Object.values(teamById);
  if (!teams.length || teams[0].strength === undefined || teams[0].strength === null) return null;
  const runs = teams.map((t) => {
    const next = [];
    for (const f of fixtures) {
      if (next.length >= 5) break;
      const oppId = f.home_team === t.id ? f.away_team : f.away_team === t.id ? f.home_team : null;
      if (oppId === null) continue;
      const opp = teamById[oppId];
      if (!opp || opp.strength === null || opp.strength === undefined) continue;
      next.push({ opp, home: f.home_team === t.id });
    }
    if (next.length < 3) return null;
    const avg = next.reduce((s, x) => s + Number(x.opp.strength), 0) / next.length;
    return { team: t.short_name, avg, next: next.map((x) => ({ opp: x.opp.short_name, home: x.home })) };
  }).filter(Boolean).sort((a, b) => a.avg - b.avg);
  return { easing: runs.slice(0, 3), brutal: runs.slice(-3).reverse() };
}
