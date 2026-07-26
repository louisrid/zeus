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
export const SQUAD_BUDGET = 100.0;

/* The template: the most-owned fifteen that is actually legal and actually affordable.
   Ownership order is the intent, but a fifteen costing more than the budget is not a squad anyone
   could own, so cost and the three-per-club limit are hard constraints. Greedy by ownership, then
   the cheapest legal filler for any slot ownership could not afford. */
export function templateSquad(players, budget = SQUAD_BUDGET) {
  const NEED = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  const CLUB_MAX = 3;
  const price = (p) => Number(p.price) || 0;

  const byOwn = players.slice().sort((a, b) => b.own - a.own);
  const byPrice = players.slice().sort((a, b) => price(a) - price(b));

  const picked = [];
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubs = {};
  let spend = 0;

  const canTake = (p) => {
    if (!p || !NEED[p.position]) return false;
    if (picked.includes(p)) return false;
    if (counts[p.position] >= NEED[p.position]) return false;
    if ((clubs[p.team] || 0) >= CLUB_MAX) return false;
    return true;
  };

  // Cheapest legal completion of every still-empty slot, so affordability is judged against what
  // finishing the squad would actually cost rather than against this pick alone.
  const cheapestRest = (excluding) => {
    const c = { ...counts };
    const cl = { ...clubs };
    if (excluding) { c[excluding.position] += 1; cl[excluding.team] = (cl[excluding.team] || 0) + 1; }
    let total = 0;
    const used = new Set(picked.concat(excluding ? [excluding] : []));
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
      let want = NEED[pos] - c[pos];
      for (const p of byPrice) {
        if (want <= 0) break;
        if (p.position !== pos || used.has(p)) continue;
        if ((cl[p.team] || 0) >= CLUB_MAX) continue;
        total += price(p); used.add(p); cl[p.team] = (cl[p.team] || 0) + 1; want -= 1;
      }
      if (want > 0) return Infinity;
    }
    return total;
  };

  for (const p of byOwn) {
    if (picked.length >= 15) break;
    if (!canTake(p)) continue;
    if (spend + price(p) + cheapestRest(p) > budget) continue;
    picked.push(p); spend += price(p);
    counts[p.position] += 1; clubs[p.team] = (clubs[p.team] || 0) + 1;
  }
  // Fill anything ownership could not afford with the cheapest legal option.
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    for (const p of byPrice) {
      if (counts[pos] >= NEED[pos]) break;
      if (p.position !== pos || picked.includes(p)) continue;
      if ((clubs[p.team] || 0) >= CLUB_MAX) continue;
      picked.push(p); spend += price(p);
      counts[pos] += 1; clubs[p.team] = (clubs[p.team] || 0) + 1;
    }
  }

  // Starting eleven: highest owned, respecting 1 GK, 3 DEF, 1 FWD minimums.
  const gks = picked.filter((p) => p.position === "GKP").sort((a, b) => b.own - a.own);
  const outfield = picked.filter((p) => p.position !== "GKP").sort((a, b) => b.own - a.own);
  const xi = [gks[0]].filter(Boolean);
  const c2 = { DEF: 0, MID: 0, FWD: 0 };
  for (const p of outfield) {
    if (xi.length >= 11) break;
    const slotsLeft = 11 - xi.length;
    const reserved = (p.position === "DEF" ? 0 : Math.max(0, 3 - c2.DEF))
                   + (p.position === "FWD" ? 0 : Math.max(0, 1 - c2.FWD));
    if (slotsLeft - 1 < reserved) continue;
    xi.push(p); c2[p.position] += 1;
  }
  const bench = picked.filter((p) => !xi.includes(p));
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
  xi.sort((a, b) => order[a.position] - order[b.position]);
  const fifteen = [...xi, ...bench].map((p) => ({ ...p, flag: p.status !== "a" }));
  fifteen.spend = Math.round(spend * 10) / 10;
  fifteen.budget = budget;
  return fifteen;
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
