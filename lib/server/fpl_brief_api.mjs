import { currentGeneration } from "../projection_generation.mjs";

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
    const team = teamById.get(Number(player.team_id ?? player.team)) ?? {};
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

async function handle(request) {
  if (!authOkay(request)) return json({ status: "error", ok: false, error: "Unauthorized" }, 401);
  try {
    const gw = await requestedGw(request);
    const [projectionRows, playerRows, teamRows] = await Promise.all([
      rows("projections", `select=*&gw=eq.${gw}&order=computed_at.desc&limit=5000`),
      rows("players", "select=*&archive=is.false&limit=2500"),
      rows("teams", "select=*&archive=is.false&limit=100"),
    ]);
    const brief = buildBrief({ projectionRows, playerRows, teamRows, gw });
    if (!brief.projection_count) throw new Error(`No current projection rows exist for GW${gw}`);
    return json(brief);
  } catch (error) {
    console.error("FPL brief API failure", error);
    return json({
      status: "error",
      ok: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      generated_at: new Date().toISOString(),
    }, 503);
  }
}

export const GET = handle;
export const POST = handle;
export function OPTIONS() { return json({ status: "ok", ok: true }); }
