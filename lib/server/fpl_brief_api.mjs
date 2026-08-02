import { currentGeneration, generationsByGameweek } from "../projection_generation.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const env = (...keys) => keys.map((key) => process.env[key]).find((value) => value && String(value).trim());
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-api-key, x-zeus-api-key, x-fpl-api-key",
  },
});

function supabaseConfig() {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PROJECT_URL");
  const key = env(
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY",
    "SUPABASE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY",
  );
  if (!url || !key) throw new Error("Supabase URL/key are not available to the Zeus API deployment");
  return { url: String(url).replace(/\/$/, ""), key: String(key) };
}

function expectedApiKey() {
  return env(
    "ZEUS_API_KEY", "FPL_BRIEF_API_KEY", "FPLBOT_API_KEY", "FPL_API_KEY",
    "OPENWEBUI_API_KEY", "ZEUS_API_TOKEN", "FPL_API_SECRET",
  ) || "";
}

function authOkay(request) {
  const expected = expectedApiKey();
  if (!expected) return true;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-api-key")
    || request.headers.get("x-zeus-api-key")
    || request.headers.get("x-fpl-api-key")
    || request.headers.get("authorization")
    || url.searchParams.get("api_key")
    || url.searchParams.get("key")
    || "";
  return supplied === expected || supplied === `Bearer ${expected}`;
}

async function rows(table, query) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    cache: "no-store",
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} returned ${response.status}: ${text.slice(0, 700)}`);
  const value = text ? JSON.parse(text) : [];
  return Array.isArray(value) ? value : [];
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row?.[key] !== null && row?.[key] !== undefined) return row[key];
  }
  return null;
}

function positionOf(player) {
  const raw = pick(player, "position", "element_type");
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) {
    return [null, "GKP", "DEF", "MID", "FWD"][numeric];
  }
  const text = String(raw ?? "").toUpperCase();
  return text === "GK" ? "GKP" : (text || null);
}


export function buildFixturePayload({ fixtureRows = [], teamRows = [] } = {}) {
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  return fixtureRows.map((fixture) => {
    const home = teamById.get(Number(fixture.home_team)) || {};
    const away = teamById.get(Number(fixture.away_team)) || {};
    return {
      fixture_id: Number(fixture.id), fpl_fixture_id: finite(fixture.fpl_id),
      gw: finite(fixture.gw), kickoff_utc: fixture.kickoff_utc ?? null,
      home_team: pick(home, "short_name", "name") ?? Number(fixture.home_team),
      away_team: pick(away, "short_name", "name") ?? Number(fixture.away_team),
      home_team_id: Number(fixture.home_team), away_team_id: Number(fixture.away_team),
      finished: Boolean(fixture.finished),
      home_goals: finite(fixture.home_goals), away_goals: finite(fixture.away_goals),
      season: fixture.season ?? null, competition: fixture.competition ?? null,
    };
  });
}

export function buildSeasonProjectionRows({ projectionRows = [], playerRows = [], teamRows = [] } = {}) {
  const playerById = new Map(playerRows.map((player) => [Number(player.id), player]));
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  const generations = generationsByGameweek(projectionRows);
  const output = [];
  for (const [gw, generation] of generations) {
    for (const projection of generation.rows) {
      const player = playerById.get(Number(projection.player_id)) || {};
      const resolvedTeamId = finite(projection?.quantiles?.diagnostics?.resolved_team_id)
        ?? finite(player.team_id ?? player.team);
      const team = teamById.get(Number(resolvedTeamId)) || {};
      output.push({
        gw, player_id: Number(projection.player_id), fpl_id: finite(pick(player, "fpl_id", "element")),
        name: pick(player, "web_name", "name", "second_name") ?? `Player ${projection.player_id}`,
        team: pick(team, "short_name", "name") ?? null, position: positionOf(player),
        xpts: finite(projection.ep_mean), expected_minutes: finite(projection.r_exp_minutes),
        start_probability: finite(projection.r_p_start), cameo_probability: finite(projection.r_p_cameo),
        clean_sheet_probability: finite(projection.p_cs), expected_goals: finite(projection.e_goals),
        expected_assists: finite(projection.e_assists), expected_bonus: finite(projection.e_bonus),
        expected_defcon: finite(projection.e_defcon), lambda_team: finite(projection.lambda_team),
        lambda_opponent: finite(projection.lambda_opponent), minutes_source: projection.minutes_source ?? null,
        rate_source: projection.rate_source ?? null, model_version: projection.model_version ?? null,
        computed_at: projection.computed_at ?? null,
      });
    }
  }
  return output.sort((a,b) => a.gw - b.gw || b.xpts - a.xpts || a.name.localeCompare(b.name));
}

export function buildBrief({ projectionRows, playerRows, teamRows, gw }) {
  const generation = currentGeneration(projectionRows, gw);
  const playerById = new Map(playerRows.map((player) => [Number(player.id), player]));
  const playerByFplId = new Map(playerRows.map((player) => [Number(player.fpl_id ?? player.element), player]));
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));

  const deduped = new Map();
  for (const projection of generation.rows) {
    const id = Number(projection.player_id);
    if (!deduped.has(id)) deduped.set(id, projection);
  }

  const players = [...deduped.values()].map((projection) => {
    const player = playerById.get(Number(projection.player_id))
      ?? playerByFplId.get(Number(projection.player_id))
      ?? {};
    const resolvedTeamId = finite(projection?.quantiles?.diagnostics?.resolved_team_id);
    const team = teamById.get(Number(resolvedTeamId ?? player.team_id ?? player.team)) ?? {};
    const rawPrice = finite(pick(player, "now_cost", "price"));
    const price = rawPrice !== null && rawPrice > 20 ? rawPrice / 10 : rawPrice;
    const xpts = finite(projection.ep_mean);
    return {
      player_id: Number(projection.player_id),
      fpl_id: finite(pick(player, "fpl_id", "element")),
      name: pick(player, "web_name", "name", "second_name") ?? `Player ${projection.player_id}`,
      full_name: [pick(player, "first_name"), pick(player, "second_name")].filter(Boolean).join(" ") || null,
      team: pick(team, "short_name", "name") ?? pick(player, "team_short", "team_name") ?? null,
      position: positionOf(player),
      price,
      ownership: finite(pick(player, "selected_by_percent", "selected_by", "ownership")),
      xpts,
      xp: xpts,
      start_probability: finite(projection.r_p_start),
      cameo_probability: finite(projection.r_p_cameo),
      expected_minutes: finite(projection.r_exp_minutes),
      expected_goals: finite(projection.e_goals),
      expected_assists: finite(projection.e_assists),
      expected_bonus: finite(projection.e_bonus),
      expected_defcon: finite(projection.e_defcon),
      clean_sheet_probability: finite(projection.p_cs),
      lambda_team: finite(projection.lambda_team),
      lambda_opponent: finite(projection.lambda_opponent),
      minutes_source: projection.minutes_source ?? null,
      rate_source: projection.rate_source ?? null,
      lineup_confidence: finite(projection.lineup_confidence),
      model_version: projection.model_version ?? null,
      computed_at: projection.computed_at ?? null,
    };
  }).filter((player) => player.xpts !== null).sort((a, b) => b.xpts - a.xpts);

  const available = players.filter((player) => player.minutes_source !== "unavailable");
  const publicPlayers = available.slice(0, 200);
  const topPlayers = publicPlayers.slice(0, 50);
  const leader = topPlayers[0]?.xpts ?? 0;
  const essentialPlayers = topPlayers.filter((player) =>
    player.xpts >= Math.max(5, leader - 0.55)
    && (player.start_probability === null || player.start_probability >= 0.78)
  );
  const captainCandidates = topPlayers.filter((player) =>
    player.xpts >= Math.max(4.5, leader - 1.25)
    && (player.start_probability === null || player.start_probability >= 0.72)
  ).slice(0, 10);
  const missingProvenance = players.filter((player) => !player.minutes_source || player.start_probability === null);
  const zeroLikelyStarters = players.filter((player) =>
    player.start_probability !== null && player.start_probability >= 0.7 && player.xpts < 0.5);
  const warnings = [];
  if (generation.staleRows.length) warnings.push(`${generation.staleRows.length} stale projection rows were ignored`);
  if (missingProvenance.length) warnings.push(`${missingProvenance.length} current rows lack minutes provenance`);
  if (zeroLikelyStarters.length) warnings.push(`${zeroLikelyStarters.length} likely starters have implausibly low xPts`);
  const generatedAt = new Date().toISOString();
  const brief = topPlayers.length
    ? `GW${gw}: ${topPlayers[0].name} leads the current Zeus projections at ${topPlayers[0].xpts.toFixed(2)} xPts.`
    : `GW${gw}: no current projections are available.`;

  return {
    ok: true,
    success: true,
    status: "ok",
    source: "Zeus",
    gameweek: gw,
    gw,
    next_gw: gw,
    generated_at: generatedAt,
    latest_projection_run: generation.computedAt,
    model_version: generation.modelVersion,
    projection_count: players.length,
    stale_rows_excluded: generation.staleRows.length,
    coverage_warning: warnings.length ? warnings.join("; ") : null,
    warnings,
    brief,
    summary: brief,
    players: publicPlayers,
    projections: publicPlayers,
    top_players: topPlayers,
    top_20: topPlayers.slice(0, 20),
    essential_players: essentialPlayers,
    essential_candidates: essentialPlayers,
    captain_candidates: captainCandidates,
    unavailable_players: players.filter((player) => player.minutes_source === "unavailable").slice(0, 50),
    data: {
      gameweek: gw,
      gw,
      generated_at: generatedAt,
      players: publicPlayers,
      projections: publicPlayers,
      top_players: topPlayers,
      essential_players: essentialPlayers,
      captain_candidates: captainCandidates,
    },
  };
}

async function requestedGw(request) {
  const url = new URL(request.url);
  let value = Number(url.searchParams.get("gw") ?? url.searchParams.get("gameweek"));
  if (request.method === "POST") {
    try {
      const body = await request.clone().json();
      value = Number(body?.gw ?? body?.gameweek ?? value);
    } catch {}
  }
  if (Number.isInteger(value) && value > 0 && value <= 38) return value;
  const unfinished = await rows("gameweeks", "select=gw&finished=is.false&order=gw.asc&limit=1");
  const active = Number(unfinished[0]?.gw);
  if (Number.isInteger(active)) return active;
  const latest = await rows("projections", "select=gw,computed_at&order=computed_at.desc&limit=1");
  const fallback = Number(latest[0]?.gw);
  if (!Number.isInteger(fallback)) throw new Error("No projected gameweek exists");
  return fallback;
}

async function handleSeasonView(request, view) {
  const url = new URL(request.url);
  const [teamRows, fixtureRows] = await Promise.all([
    rows("teams", "select=*&archive=is.false&limit=100"),
    rows("fixtures", "select=id,fpl_id,gw,home_team,away_team,kickoff_utc,finished,season,competition,home_goals,away_goals&season=eq.2026-27&competition=eq.PL&order=gw.asc,kickoff_utc.asc&limit=1000"),
  ]);
  const fixtures = buildFixturePayload({ fixtureRows, teamRows });
  if (view === "fixtures") return json({ ok: true, view, fixture_count: fixtures.length, gameweeks: 38, fixtures });

  const gwFrom = Math.max(1, Math.min(38, Number(url.searchParams.get("gw_from")) || 1));
  const gwTo = Math.max(gwFrom, Math.min(38, Number(url.searchParams.get("gw_to")) || 38));
  const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit")) || 5000));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const [projectionRows, playerRows] = await Promise.all([
    rows("projections", `select=*&gw=gte.${gwFrom}&gw=lte.${gwTo}&order=gw.asc,computed_at.desc&limit=${limit}&offset=${offset}`),
    rows("players", "select=*&archive=is.false&limit=2500"),
  ]);
  let projections = buildSeasonProjectionRows({ projectionRows, playerRows, teamRows });
  const playerQuery = String(url.searchParams.get("player") || "").trim().toLowerCase();
  const teamQuery = String(url.searchParams.get("team") || "").trim().toLowerCase();
  if (playerQuery) projections = projections.filter((row) => row.name.toLowerCase().includes(playerQuery));
  if (teamQuery) projections = projections.filter((row) => String(row.team || "").toLowerCase() === teamQuery);

  const body = {
    ok: true, view, season: "2026-27", competition: "PL", gw_from: gwFrom, gw_to: gwTo,
    fixture_count: fixtures.length, projection_count: projections.length, limit, offset,
    next_offset: projectionRows.length === limit ? offset + limit : null,
    fixtures: view === "season" ? fixtures : undefined,
    projections,
    usage: {
      all_fixtures: "/api/brief?view=fixtures",
      season_page: "/api/brief?view=season&gw_from=1&gw_to=38&limit=5000&offset=0",
      one_player: "/api/brief?view=xpts&player=Maguire&gw_from=1&gw_to=38",
      one_team: "/api/brief?view=xpts&team=MUN&gw_from=1&gw_to=38",
    },
  };
  return json(body);
}

async function handle(request) {
  if (!authOkay(request)) return json({ status: "error", ok: false, error: "Unauthorized" }, 401);
  try {
    const url = new URL(request.url);
    const view = String(url.searchParams.get("view") || "brief").toLowerCase();
    if (["season", "fixtures", "xpts"].includes(view)) return await handleSeasonView(request, view);
    const gw = await requestedGw(request);
    const [projectionRows, playerRows, teamRows] = await Promise.all([
      rows("projections", `select=*&gw=eq.${gw}&order=computed_at.desc&limit=5000`),
      rows("players", "select=*&archive=is.false&limit=2500"),
      rows("teams", "select=*&archive=is.false&limit=100"),
    ]);
    let fixtureRows = [];
    try {
      fixtureRows = await rows("fixtures", `select=id,fpl_id,gw,home_team,away_team,kickoff_utc,finished,season,competition,home_goals,away_goals&gw=eq.${gw}&season=eq.2026-27&competition=eq.PL&order=kickoff_utc.asc&limit=20`);
    } catch (error) {
      console.warn(`Fixture enrichment unavailable for GW${gw}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const brief = buildBrief({ projectionRows, playerRows, teamRows, gw });
    if (!brief.projection_count) throw new Error(`No current projection rows exist for GW${gw}`);
    brief.fixtures = buildFixturePayload({ fixtureRows, teamRows });
    brief.season_data = {
      fixtures: "/api/brief?view=fixtures",
      all_xpts: "/api/brief?view=xpts&gw_from=1&gw_to=38&limit=5000&offset=0",
      full_season: "/api/brief?view=season&gw_from=1&gw_to=38&limit=5000&offset=0",
    };
    brief.data.fixtures = brief.fixtures;
    return json(brief);
  } catch (error) {
    console.error("FPL brief API failure", error);
    return json({ status: "error", ok: false, success: false,
      error: error instanceof Error ? error.message : String(error), generated_at: new Date().toISOString() }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export function OPTIONS() { return json({ status: "ok", ok: true }); }
