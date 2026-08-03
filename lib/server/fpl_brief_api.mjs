import {
  buildExternalProjectionRows,
  EXTERNAL_XPTS_GAMEWEEKS,
  EXTERNAL_XPTS_GW_FROM,
  EXTERNAL_XPTS_GW_TO,
  EXTERNAL_XPTS_IMPORTED_AT,
  EXTERNAL_XPTS_MODEL_VERSION,
  EXTERNAL_XPTS_SOURCE,
} from "../external_xpts.mjs";

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

function livePlayers(playerRows, teamRows) {
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  return playerRows
    .filter((player) => player && player.archive !== true)
    .map((player) => {
      const rawPrice = finite(pick(player, "price", "now_cost"));
      const price = rawPrice !== null && rawPrice > 20 ? rawPrice / 10 : rawPrice;
      const team = teamById.get(Number(pick(player, "team_id", "team"))) || {};
      return {
        ...player,
        fpl_id: finite(pick(player, "fpl_id", "element")),
        web_name: pick(player, "web_name", "name", "second_name"),
        position: positionOf(player),
        team_id: finite(pick(player, "team_id", "team")),
        team: pick(team, "short_name", "name") ?? pick(player, "team_short", "team_name") ?? null,
        price,
        own: finite(pick(player, "selected_by_pct", "selected_by_percent", "selected_by", "ownership")) ?? 0,
      };
    })
    .filter((player) => player.fpl_id !== null && player.web_name && player.position && player.price !== null);
}

export function buildFixturePayload({ fixtureRows = [], teamRows = [] } = {}) {
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  return fixtureRows.map((fixture) => {
    const home = teamById.get(Number(fixture.home_team)) || {};
    const away = teamById.get(Number(fixture.away_team)) || {};
    return {
      fixture_id: Number(fixture.id),
      fpl_fixture_id: finite(fixture.fpl_id),
      gw: finite(fixture.gw),
      kickoff_utc: fixture.kickoff_utc ?? null,
      home_team: pick(home, "short_name", "name") ?? Number(fixture.home_team),
      away_team: pick(away, "short_name", "name") ?? Number(fixture.away_team),
      home_team_id: Number(fixture.home_team),
      away_team_id: Number(fixture.away_team),
      finished: Boolean(fixture.finished),
      home_goals: finite(fixture.home_goals),
      away_goals: finite(fixture.away_goals),
      season: fixture.season ?? null,
      competition: fixture.competition ?? null,
    };
  });
}

export function buildSeasonProjectionRows({ playerRows = [], teamRows = [] } = {}) {
  const players = livePlayers(playerRows, teamRows);
  return buildExternalProjectionRows(players).rows
    .sort((a, b) => a.gw - b.gw || b.xpts - a.xpts || a.name.localeCompare(b.name));
}

function briefPlayers({ playerRows = [], teamRows = [], gw }) {
  const players = livePlayers(playerRows, teamRows);
  const built = buildExternalProjectionRows(players, { currentGw: gw });
  return {
    players: built.rows.filter((row) => row.gw === Number(gw)).sort((a, b) => b.xpts - a.xpts || a.name.localeCompare(b.name)),
    report: built.report,
  };
}

export function buildBrief({ playerRows = [], teamRows = [], gw }) {
  const { players, report } = briefPlayers({ playerRows, teamRows, gw });
  const publicPlayers = players.slice(0, 1000);
  const topPlayers = publicPlayers.slice(0, 50);
  const leader = topPlayers[0]?.xpts ?? 0;
  const essentialPlayers = topPlayers.filter((player) =>
    player.xpts >= Math.max(5, leader - 0.55)
    && (player.start_probability === null || player.start_probability >= 0.78));
  const captainCandidates = topPlayers.filter((player) =>
    player.xpts >= Math.max(4.5, leader - 1.25)
    && (player.start_probability === null || player.start_probability >= 0.72)).slice(0, 10);
  const warnings = [];
  if (report.zeroed_duplicate_players) warnings.push(`${report.zeroed_duplicate_players} duplicate-name players are temporarily zeroed`);
  if (report.zeroed_unmatched_players) warnings.push(`${report.zeroed_unmatched_players} unmatched FPL players are temporarily zeroed`);
  if (report.unmatched_source_rows.length) warnings.push(`${report.unmatched_source_rows.length} source rows did not match an FPL player`);
  const brief = topPlayers.length
    ? `GW${gw}: ${topPlayers[0].name} leads the imported external projections at ${topPlayers[0].xpts.toFixed(1)} xPts.`
    : `GW${gw}: no external projections are available.`;
  return {
    ok: true,
    success: true,
    status: "ok",
    source: EXTERNAL_XPTS_SOURCE,
    source_mode: "external-only",
    gameweek: Number(gw),
    gw: Number(gw),
    next_gw: Number(gw),
    available_gameweeks: [...EXTERNAL_XPTS_GAMEWEEKS],
    generated_at: new Date().toISOString(),
    latest_projection_run: EXTERNAL_XPTS_IMPORTED_AT,
    model_version: EXTERNAL_XPTS_MODEL_VERSION,
    projection_count: players.length,
    stale_rows_excluded: 0,
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
    unavailable_players: publicPlayers.filter((player) => player.expected_minutes <= 0).slice(0, 100),
    match_report: report,
    data: {
      gameweek: Number(gw),
      gw: Number(gw),
      generated_at: new Date().toISOString(),
      players: publicPlayers,
      projections: publicPlayers,
      top_players: topPlayers,
      essential_players: essentialPlayers,
      captain_candidates: captainCandidates,
    },
  };
}

async function requestParameters(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  if (request.method === "POST") {
    try {
      const body = await request.clone().json();
      if (body && typeof body === "object") Object.assign(params, body);
    } catch {}
  }
  return params;
}

function parseGw(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function ensureExternalGw(gw) {
  if (!Number.isInteger(gw) || gw < EXTERNAL_XPTS_GW_FROM || gw > EXTERNAL_XPTS_GW_TO) {
    const error = new Error(`External xPTS is temporarily available only for GW${EXTERNAL_XPTS_GW_FROM}-GW${EXTERNAL_XPTS_GW_TO}.`);
    error.status = 400;
    throw error;
  }
  return gw;
}

async function defaultGw() {
  const unfinished = await rows("gameweeks", "select=gw&finished=is.false&order=gw.asc&limit=1").catch(() => []);
  const active = Number(unfinished[0]?.gw);
  if (Number.isInteger(active) && active >= EXTERNAL_XPTS_GW_FROM && active <= EXTERNAL_XPTS_GW_TO) return active;
  return EXTERNAL_XPTS_GW_FROM;
}

async function loadTables({ fixtures = false } = {}) {
  const calls = [
    rows("teams", "select=*&archive=is.false&limit=100"),
    rows("players", "select=*&archive=is.false&limit=2500"),
  ];
  if (fixtures) {
    calls.push(rows("fixtures", "select=id,fpl_id,gw,home_team,away_team,kickoff_utc,finished,season,competition,home_goals,away_goals&season=eq.2026-27&competition=eq.PL&order=gw.asc,kickoff_utc.asc&limit=1000"));
  }
  const [teamRows, playerRows, fixtureRows = []] = await Promise.all(calls);
  return { teamRows, playerRows, fixtureRows };
}

function arrayParam(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function filterProjectionRows(projections, params) {
  let rowsOut = projections;
  const names = arrayParam(params.player_names ?? params.players ?? params.name ?? params.player).map((value) => value.toLowerCase());
  const clubs = arrayParam(params.clubs ?? params.club ?? params.team).map((value) => value.toLowerCase());
  const positions = arrayParam(params.positions ?? params.position).map((value) => value.toUpperCase());
  if (names.length) rowsOut = rowsOut.filter((row) => names.some((name) => row.name.toLowerCase().includes(name)));
  if (clubs.length) rowsOut = rowsOut.filter((row) => clubs.includes(String(row.team || "").toLowerCase()));
  if (positions.length) rowsOut = rowsOut.filter((row) => positions.includes(String(row.position || "").toUpperCase()));
  const priceMin = finite(params.price_min);
  const priceMax = finite(params.price_max);
  const ownershipMin = finite(params.ownership_min);
  const ownershipMax = finite(params.ownership_max);
  if (priceMin !== null) rowsOut = rowsOut.filter((row) => finite(row.price) !== null && Number(row.price) >= priceMin);
  if (priceMax !== null) rowsOut = rowsOut.filter((row) => finite(row.price) !== null && Number(row.price) <= priceMax);
  if (ownershipMin !== null) rowsOut = rowsOut.filter((row) => finite(row.ownership) !== null && Number(row.ownership) >= ownershipMin);
  if (ownershipMax !== null) rowsOut = rowsOut.filter((row) => finite(row.ownership) !== null && Number(row.ownership) <= ownershipMax);
  return rowsOut;
}

function sortRows(rowsIn, params) {
  const direction = String(params.sort_direction || "desc").toLowerCase() === "asc" ? 1 : -1;
  const key = String(params.sort_by || "xpts").toLowerCase();
  const read = (row) => {
    if (key === "expected_minutes" || key === "expected_minutes_total") return finite(row.expected_minutes) ?? 0;
    if (key === "ownership") return finite(row.ownership) ?? 0;
    if (key === "price") return finite(row.price) ?? 0;
    if (key === "xpts_per_million") return Number(row.price) > 0 ? Number(row.xpts) / Number(row.price) : 0;
    if (key === "total_xpts") return finite(row.xpts_total_8gw) ?? 0;
    return finite(row.xpts) ?? 0;
  };
  return rowsIn.slice().sort((a, b) => direction * (read(a) - read(b))
    || a.name.localeCompare(b.name) || String(a.team || "").localeCompare(String(b.team || ""))
    || Number(a.player_id) - Number(b.player_id));
}

async function handleSeasonView(request, view, params) {
  const { teamRows, playerRows, fixtureRows } = await loadTables({ fixtures: true });
  const fixtures = buildFixturePayload({ fixtureRows, teamRows });
  if (view === "fixtures") {
    return json({
      ok: true,
      view,
      fixture_count: fixtures.length,
      fixture_gameweeks: 38,
      xpts_gameweeks: [...EXTERNAL_XPTS_GAMEWEEKS],
      fixtures,
    });
  }

  const gwFrom = ensureExternalGw(parseGw(params.gw_from, EXTERNAL_XPTS_GW_FROM));
  const gwTo = ensureExternalGw(parseGw(params.gw_to, EXTERNAL_XPTS_GW_TO));
  if (gwTo < gwFrom) throw Object.assign(new Error("gw_to must be greater than or equal to gw_from"), { status: 400 });
  const limit = Math.max(1, Math.min(5000, Number(params.limit) || 5000));
  const offset = Math.max(0, Number(params.offset) || 0);
  const players = livePlayers(playerRows, teamRows);
  const built = buildExternalProjectionRows(players, { currentGw: gwFrom });
  let projections = built.rows.filter((row) => row.gw >= gwFrom && row.gw <= gwTo);
  projections = sortRows(filterProjectionRows(projections, params), params);
  const total = projections.length;
  projections = projections.slice(offset, offset + limit);

  return json({
    ok: true,
    view,
    source: EXTERNAL_XPTS_SOURCE,
    source_mode: "external-only",
    model_version: EXTERNAL_XPTS_MODEL_VERSION,
    imported_at: EXTERNAL_XPTS_IMPORTED_AT,
    season: "2026-27",
    competition: "PL",
    gw_from: gwFrom,
    gw_to: gwTo,
    available_gameweeks: [...EXTERNAL_XPTS_GAMEWEEKS],
    fixture_count: fixtures.length,
    projection_count: total,
    returned_projection_count: projections.length,
    limit,
    offset,
    next_offset: offset + projections.length < total ? offset + projections.length : null,
    fixtures: view === "season" ? fixtures : undefined,
    projections,
    match_report: built.report,
    usage: {
      all_fixtures: "/api/brief?view=fixtures",
      imported_xpts: "/api/brief?view=xpts&gw_from=1&gw_to=8&limit=5000&offset=0",
      one_player: "/api/brief?view=xpts&player=Haaland&gw_from=1&gw_to=8",
      one_team: "/api/brief?view=xpts&team=MCI&gw_from=1&gw_to=8",
    },
  });
}

async function handle(request) {
  if (!authOkay(request)) return json({ status: "error", ok: false, error: "Unauthorized" }, 401);
  try {
    const params = await requestParameters(request);
    const view = String(params.view || "brief").toLowerCase();
    if (["season", "fixtures", "xpts"].includes(view)) return await handleSeasonView(request, view, params);

    const requested = parseGw(params.gw ?? params.gameweek, await defaultGw());
    const gw = ensureExternalGw(requested);
    const { teamRows, playerRows, fixtureRows } = await loadTables({ fixtures: true });
    const brief = buildBrief({ playerRows, teamRows, gw });
    brief.fixtures = buildFixturePayload({
      fixtureRows: fixtureRows.filter((fixture) => Number(fixture.gw) === gw),
      teamRows,
    });
    brief.season_data = {
      fixtures: "/api/brief?view=fixtures",
      all_xpts: "/api/brief?view=xpts&gw_from=1&gw_to=8&limit=5000&offset=0",
      imported_window: "/api/brief?view=season&gw_from=1&gw_to=8&limit=5000&offset=0",
    };
    brief.data.fixtures = brief.fixtures;
    return json(brief);
  } catch (error) {
    console.error("FPL brief API failure", error);
    return json({
      status: "error",
      ok: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      available_gameweeks: [...EXTERNAL_XPTS_GAMEWEEKS],
      generated_at: new Date().toISOString(),
    }, Number(error?.status) || 503);
  }
}

export const GET = handle;
export const POST = handle;
export function OPTIONS() { return json({ status: "ok", ok: true }); }
