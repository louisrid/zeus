"use client";
import { sb } from "../../../lib/data";

export { sb };

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
    .from("fixtures").select("gw, home_team, away_team, kickoff_utc, fpl_id")
    .lt("fpl_id", 1000000).not("home_team", "is", null).not("away_team", "is", null)
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
    const oppId = f.home_team === teamId ? f.away_team : f.away_team === teamId ? f.home_team : null;
    if (oppId === null || !teamById[oppId]) continue;
    out.push({ opp: teamById[oppId].short_name, home: f.home_team === teamId, gw: f.gw });
    if (out.length >= n) break;
  }
  return out;
}
export const fixLabel = (f) => (f.home ? `${f.opp} (H)` : `${f.opp.toLowerCase()} (A)`);
