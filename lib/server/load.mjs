/* SERVER-SIDE LOADING FOR THE BRIEF AND OPTIMISER.
 *
 * Temporary external-xPTS mode: player, team, fixture, prior-season and saved-plan data still come from
 * Supabase. Internal projections, minutes forecasts, odds, line-ups, calibration and scoring maths are not
 * read. xPTS and expected minutes come only from config/external-xpts-2026-27.json.
 */
import { createClient } from "@supabase/supabase-js";
import { buildOpponentScale } from "../opponent.js";
import { buildExternalProjectionModel } from "../external_xpts.mjs";
import { serverLineupGate } from "./lineup-gate.mjs";
export { fixtureCounts, blanksAndDoubles } from "./fixtures.mjs";
import { ARCHIVE_OFFSET } from "./fixtures.mjs";

function db(needsAdmin = false) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = service || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("The database is not configured on the server.");
  if (needsAdmin && !service) {
    throw new Error("SUPABASE_SERVICE_KEY is not set on the server, so saved plans cannot be read.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function all(client, table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export async function loadForServer() {
  const client = db(true);
  const [teamRows, playerRows, fixtureRows, priorRows, planRows, gameweekRows] = await Promise.all([
    all(client, "teams", "*"),
    all(client, "players", "*"),
    all(client, "fixtures", "*"),
    all(client, "player_prior_season", "player_id, points").catch(() => []),
    all(client, "plans", "*"),
    all(client, "gameweeks", "gw, deadline_utc, finished").catch(() => []),
  ]);

  const liveTeams = teamRows.filter((team) => team && team.archive !== true);
  const teamById = Object.fromEntries(liveTeams.map((team) => [Number(team.id), team]));
  const players = playerRows
    .filter((player) => player && player.archive !== true)
    .map((player) => {
      const rawPrice = finite(player.price ?? player.now_cost);
      return {
        ...player,
        team: teamById[Number(player.team_id)]?.short_name || "—",
        own: finite(player.selected_by_pct ?? player.selected_by_percent ?? player.selected_by) ?? 0,
        price: rawPrice !== null && rawPrice > 20 ? rawPrice / 10 : (rawPrice ?? 0),
      };
    })
    .filter((player) => player.fpl_id !== null && player.fpl_id !== undefined && player.position && Number(player.price) > 0);

  const fixtures = fixtureRows
    .filter((fixture) => fixture.gw !== null && fixture.gw !== undefined)
    .filter((fixture) => Number(fixture.fpl_id) < ARCHIVE_OFFSET)
    .filter((fixture) => fixture.home_team !== null && fixture.away_team !== null)
    .filter((fixture) => teamById[Number(fixture.home_team)] && teamById[Number(fixture.away_team)])
    .sort((a, b) => Number(a.gw) - Number(b.gw) || String(a.kickoff_utc || "").localeCompare(String(b.kickoff_utc || "")));

  const firstUnfinished = gameweekRows
    .filter((row) => row.finished !== true)
    .map((row) => Number(row.gw))
    .filter(Number.isInteger)
    .sort((a, b) => a - b)[0];
  const now = Date.now();
  const upcoming = fixtures.filter((fixture) => !fixture.kickoff_utc || new Date(fixture.kickoff_utc).getTime() > now);
  const gw = Number.isInteger(firstUnfinished)
    ? firstUnfinished
    : (upcoming.length ? Number(upcoming[0].gw) : (fixtures.length ? Number(fixtures[0].gw) : 1));

  const byInternalId = new Map(players.map((player) => [Number(player.id), player]));
  const lastSeasonPointsByFpl = new Map();
  for (const row of priorRows) {
    const player = byInternalId.get(Number(row.player_id));
    const points = Number(row.points);
    if (player && Number.isFinite(points) && points > 0) lastSeasonPointsByFpl.set(Number(player.fpl_id), points);
  }

  const lineupGate = serverLineupGate(players, liveTeams);
  const scorer = buildExternalProjectionModel(players, {
    currentGw: gw,
    lastSeasonPointsByFpl,
    lineupStartingIds: lineupGate.active ? lineupGate.startingIds : null,
    lineupGateReport: lineupGate.report,
  });
  const scale = buildOpponentScale(teamById);
  const plans = (planRows || []).slice().sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  return {
    teamRows: liveTeams,
    teamById,
    players,
    fixtures,
    gw,
    scorer,
    scale,
    minutes: scorer.minutes,
    plans,
    byInternalId,
    lineupsCaptured: scorer.externalImportAt,
    projectionGeneration: scorer.projectionGeneration,
    staleProjectionRowsExcluded: 0,
    resolvedTeamChanges: [],
    externalMatchReport: scorer.matchReport,
    lineupGate: scorer.lineupGate,
  };
}
