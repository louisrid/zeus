import { parsePlayerQueryParams, queryPlayerRows } from "../player-query.mjs";
import { readAllSupabaseRows } from "./query-source.mjs";

export async function loadPlayerQuerySource({ gwFrom = 1, gwTo = 38 } = {}) {
  const [playerRows, teamRows, projectionRows] = await Promise.all([
    readAllSupabaseRows("players", "select=*&archive=is.false"),
    readAllSupabaseRows("teams", "select=*&archive=is.false"),
    readAllSupabaseRows("projections", `select=player_id,gw,model_version,computed_at,ep_mean,r_exp_minutes,r_p_start,quantiles&gw=gte.${gwFrom}&gw=lte.${gwTo}&order=gw.asc,computed_at.desc`),
  ]);
  return { playerRows, teamRows, projectionRows };
}

export async function queryPlayersFromDatabase(rawParams = {}) {
  const params = rawParams.gwFrom ? rawParams : parsePlayerQueryParams(rawParams);
  const source = await loadPlayerQuerySource(params);
  return queryPlayerRows(source, params);
}
