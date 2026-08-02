import { buildFixtureQueryResult, parseFixtureQueryParams } from "../fixture-query.mjs";
import { readAllSupabaseRows } from "./query-source.mjs";

export async function loadFixtureQuerySource() {
  const [fixtureRows, teamRows] = await Promise.all([
    readAllSupabaseRows(
      "fixtures",
      "select=id,fpl_id,gw,home_team,away_team,kickoff_utc,finished,season,competition,home_goals,away_goals&season=eq.2026-27&competition=eq.PL&order=gw.asc,kickoff_utc.asc",
    ),
    readAllSupabaseRows("teams", "select=*&archive=is.false"),
  ]);
  return { fixtureRows, teamRows };
}

export async function queryFixturesFromDatabase(rawParams = {}) {
  const params = rawParams.gwFrom ? rawParams : parseFixtureQueryParams(rawParams);
  const source = await loadFixtureQuerySource();
  return buildFixtureQueryResult(source, params);
}
