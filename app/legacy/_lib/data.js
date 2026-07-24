"use client";
import { createClient } from "@supabase/supabase-js";

let client = null;
export function sb() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}

// Players joined to club short names, plus team map and upcoming fixtures.
export async function loadCore() {
  const supabase = sb();
  const [{ data: teams }, { data: players }, { data: gws }] = await Promise.all([
    supabase.from("teams").select("id, short_name, name"),
    supabase.from("players").select("*").order("selected_by_pct", { ascending: false }).limit(1000),
    supabase.from("gameweeks").select("gw, deadline_utc, finished").eq("finished", false).order("gw").limit(1),
  ]);
  const teamById = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const currentGw = gws && gws[0] ? gws[0].gw : 1;
  const { data: fixtures } = await supabase
    .from("fixtures").select("gw, home_team, away_team, kickoff_utc")
    .gte("gw", currentGw).lte("gw", currentGw + 5).order("kickoff_utc");
  const enriched = (players || []).map((p) => ({
    ...p,
    team: teamById[p.team_id] ? teamById[p.team_id].short_name : "—",
    own: p.selected_by_pct === null ? 0 : Number(p.selected_by_pct),
    price: p.price === null ? 0 : Number(p.price),
  }));
  return { players: enriched, teamById, fixtures: fixtures || [], currentGw };
}

export function nextFixtures(fixtures, teamById, teamId, n) {
  const out = [];
  for (const f of fixtures) {
    if (f.home_team === teamId) out.push({ opp: teamById[f.away_team]?.short_name || "—", home: true, gw: f.gw });
    else if (f.away_team === teamId) out.push({ opp: teamById[f.home_team]?.short_name || "—", home: false, gw: f.gw });
    if (out.length >= n) break;
  }
  return out;
}
export const fixLabel = (f) => (f.home ? `${f.opp} (H)` : `${f.opp.toLowerCase()} (A)`);
