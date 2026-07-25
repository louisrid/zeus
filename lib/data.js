"use client";
import { createClient } from "@supabase/supabase-js";
import { loadGate } from "./interim";

let client = null;
export function sb() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}

export async function loadCore() {
  const supabase = sb();
  const [teamsRes, playersRes, gwsRes] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("players").select("*").order("selected_by_pct", { ascending: false }).limit(1000),
    supabase.from("gameweeks").select("gw, deadline_utc, finished").eq("finished", false).order("gw").limit(1),
  ]);
  if (teamsRes.error || playersRes.error || gwsRes.error) throw new Error("database unreachable");
  const teamById = Object.fromEntries((teamsRes.data || []).map((t) => [t.id, t]));
  const currentGw = gwsRes.data && gwsRes.data[0] ? gwsRes.data[0].gw : 1;
  const { data: fixtures, error: fe } = await supabase
    .from("fixtures").select("gw, home_team, away_team, kickoff_utc")
    .gte("gw", currentGw).lte("gw", currentGw + 7).order("kickoff_utc");
  if (fe) throw new Error("database unreachable");
  const players = (playersRes.data || []).map((p) => ({
    ...p,
    team: teamById[p.team_id] ? teamById[p.team_id].short_name : "—",
    own: p.selected_by_pct === null ? 0 : Number(p.selected_by_pct),
    price: p.price === null ? 0 : Number(p.price),
  }));
  return { players, teamById, fixtures: fixtures || [], currentGw };
}

export function nextFixtures(fixtures, teamById, teamId, n) {
  const out = [];
  for (const f of fixtures) {
    if (f.home_team === teamId) out.push({ opp: teamById[f.away_team]?.short_name || "—", oppId: f.away_team, home: true, gw: f.gw });
    else if (f.away_team === teamId) out.push({ opp: teamById[f.home_team]?.short_name || "—", oppId: f.home_team, home: false, gw: f.gw });
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

/* ═══ Package 3 · engine loaders ═══
   One round trip set: the gate, the current gameweek's projections, and the market-derived goal
   environments. Everything the Builder and Squad pages score with comes from here. */
export async function loadEngine(currentGw, fixtures) {
  const supabase = sb();
  const gate = await loadGate(supabase);

  const fixtureIds = (fixtures || []).filter((f) => f.gw === currentGw).map((f) => f.id).filter(Boolean);
  const [projRes, igRes] = await Promise.all([
    supabase.from("projections")
      .select("player_id, gw, model_version, ep_mean, ep_sd, quantiles, p_12plus, p_start, low_sample, prior_blend, computed_at")
      .eq("gw", currentGw).order("computed_at", { ascending: false }).limit(1000),
    fixtureIds.length
      ? supabase.from("implied_goals").select("fixture_id, lambda_home, lambda_away, computed_at")
        .in("fixture_id", fixtureIds).order("computed_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const projections = new Map();
  for (const r of projRes.data || []) if (!projections.has(r.player_id)) projections.set(r.player_id, r);
  const implied = new Map();
  for (const r of igRes.data || []) if (!implied.has(r.fixture_id)) implied.set(r.fixture_id, r);

  return { gate, projections, implied, modelVersion: (projRes.data || [])[0]?.model_version || null };
}

/* Saved drafts. Reads are anon; every write goes through /api/drafts with the service key. */
export async function loadDrafts() {
  const { data, error } = await sb().from("squad_drafts").select("*").order("updated_at", { ascending: false }).limit(20);
  if (error) throw new Error("database unreachable");
  return data || [];
}

/* The current 15. Prefers the team-ID sync (`my_squad`, arrives with pick tracking) and falls back
   to the plan-of-record draft so the Squad page is usable now. The source is always shown. */
export async function loadCurrentSquad(currentGw) {
  const supabase = sb();
  const { data: mine } = await supabase.from("my_squad").select("*").order("gw", { ascending: false }).limit(1);
  if (mine && mine.length && mine[0].picks) {
    return { source: "team_id", gw: mine[0].gw, picks: mine[0].picks, bank: mine[0].bank, teamValue: mine[0].team_value, chip: mine[0].chip };
  }
  const { data: drafts } = await supabase.from("squad_drafts").select("*").eq("is_plan_of_record", true).limit(1);
  if (drafts && drafts.length) {
    return { source: "plan_of_record", gw: currentGw, draft: drafts[0], picks: drafts[0].squad };
  }
  return { source: "none" };
}

/* Fixture swings v1 — INTERIM: FPL team strength until odds-implied lands. */
export function fixtureSwings(fixtures, teamById, currentGw) {
  const teams = Object.values(teamById);
  if (!teams.length || teams[0].strength === undefined || teams[0].strength === null) return null;
  const runs = teams.map((t) => {
    const next = [];
    for (const f of fixtures) {
      if (next.length >= 5) break;
      if (f.home_team === t.id) next.push({ opp: teamById[f.away_team], home: true });
      else if (f.away_team === t.id) next.push({ opp: teamById[f.home_team], home: false });
    }
    if (next.length < 3) return null;
    const avg = next.reduce((s, x) => s + (x.opp?.strength || 3), 0) / next.length;
    return { team: t.short_name, avg, next: next.map((x) => ({ opp: x.opp?.short_name || "—", home: x.home })) };
  }).filter(Boolean).sort((a, b) => a.avg - b.avg);
  return { easing: runs.slice(0, 3), brutal: runs.slice(-3).reverse() };
}
