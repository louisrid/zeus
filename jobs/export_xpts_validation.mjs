#!/usr/bin/env node
/* Export the newest complete live projection generation into the exact CSV shape consumed by xpts_audit.
 * This is intentionally REST-only so GitHub Actions can run it with the same Supabase secrets as the
 * projection job, without depending on browser loaders or manual SQL exports.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { currentGeneration } from "../lib/projection_generation.mjs";

/* REST equivalent of the repository-wide Supabase guard: .not("archive", "is", true). */

const env = (...keys) => keys.map((key) => process.env[key]).find((value) => value && String(value).trim());
const BASE = String(env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PROJECT_URL") || "").replace(/\/$/, "");
const KEY = env(
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE", "SB_SERVICE_ROLE_KEY", "SUPABASE_KEY",
) || "";

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(path, init = {}) {
  if (!BASE || !KEY) throw new Error("Supabase URL/service key is missing for xPTS validation export");
  const response = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 900)}`);
  return text ? JSON.parse(text) : [];
}

async function pageAll(table, select = "*", query = "", pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const separator = query ? `&${query}` : "";
    const page = await request(`${table}?select=${encodeURIComponent(select)}${separator}`, {
      headers: { Range: `${from}-${from + pageSize - 1}` },
    });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

const numberOrBlank = (value) => Number.isFinite(Number(value)) ? Number(value) : "";
const textOrBlank = (value) => value === null || value === undefined ? "" : String(value);
const positionOf = (player) => {
  const raw = player?.position ?? player?.element_type;
  const number = Number(raw);
  if (Number.isInteger(number) && number >= 1 && number <= 4) return [null, "GKP", "DEF", "MID", "FWD"][number];
  const text = String(raw ?? "").toUpperCase();
  return text === "GK" ? "GKP" : text;
};
const priceOf = (player) => {
  const raw = Number(player?.price ?? player?.now_cost);
  if (!Number.isFinite(raw)) return "";
  return raw > 20 ? raw / 10 : raw;
};
const diagnosticOf = (row, key) => row?.quantiles?.diagnostics?.[key] ?? "";

export function csvCell(value) {
  const text = textOrBlank(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return [columns.join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n";
}

async function activeGameweek() {
  const open = await request("gameweeks?select=gw,finished&finished=eq.false&order=gw.asc&limit=1");
  if (open?.[0]?.gw !== undefined) return Number(open[0].gw);
  const fixtures = await request("fixtures?select=gw,finished&finished=eq.false&order=gw.asc&limit=1");
  if (fixtures?.[0]?.gw !== undefined) return Number(fixtures[0].gw);
  throw new Error("Could not determine the active gameweek from gameweeks or fixtures");
}

export function buildValidationRows({ players = [], teams = [], projections = [], priors = [], gw }) {
  const generation = currentGeneration(projections, gw);
  if (!generation.rows.length) throw new Error(`No current projection generation found for GW${gw}`);
  const projectionByPlayer = new Map(generation.rows.map((row) => [Number(row.player_id), row]));
  const teamById = new Map(teams.map((team) => [Number(team.id), team]));
  const priorByPlayer = new Map(priors.map((row) => [Number(row.player_id), row]));

  const activePlayers = players.filter((player) => player && player.archive !== true && player.archive !== "true");
  const rows = activePlayers.map((player) => {
    const projection = projectionByPlayer.get(Number(player.id));
    const team = teamById.get(Number(player.team_id ?? player.team));
    const prior = priorByPlayer.get(Number(player.id));
    const expectedMinutes = projection?.r_exp_minutes;
    return {
      player_id: player.id,
      fpl_id: player.fpl_id ?? player.element ?? "",
      web_name: player.web_name ?? player.name ?? `player ${player.id}`,
      team: team?.short_name ?? team?.name ?? player.team_id ?? "UNKNOWN",
      position: positionOf(player),
      price: priceOf(player),
      status: player.status ?? "",
      chance_of_playing: player.chance_of_playing ?? player.chance_of_playing_next_round ?? "",
      gw,
      xpts: numberOrBlank(projection?.ep_mean),
      ep_sd: numberOrBlank(projection?.ep_sd),
      expected_minutes: numberOrBlank(expectedMinutes),
      start_probability: numberOrBlank(projection?.r_p_start),
      cameo_probability: numberOrBlank(projection?.r_p_cameo),
      probability_60_minutes: numberOrBlank(projection?.r_p60),
      minutes_source: projection?.minutes_source ?? "",
      lineup_source: projection?.lineup_source ?? "",
      lineup_confidence: numberOrBlank(projection?.lineup_confidence),
      lambda_team: numberOrBlank(projection?.lambda_team),
      lambda_opponent: numberOrBlank(projection?.lambda_opponent),
      used_npxg90: numberOrBlank(projection?.used_npxg90),
      used_xa90: numberOrBlank(projection?.used_xa90),
      rate_source: projection?.rate_source ?? "",
      goal_share: numberOrBlank(projection?.goal_share),
      assist_share: numberOrBlank(projection?.assist_share),
      penalty_share: numberOrBlank(diagnosticOf(projection, "penalty_share")),
      team_penalty_rate: numberOrBlank(diagnosticOf(projection, "team_penalty_rate")),
      e_pen_goals: numberOrBlank(diagnosticOf(projection, "e_pen_goals")),
      e_goals: numberOrBlank(projection?.e_goals),
      e_assists: numberOrBlank(projection?.e_assists),
      p_goal: numberOrBlank(projection?.p_goal),
      p_assist: numberOrBlank(projection?.p_assist),
      p_cs: numberOrBlank(projection?.p_cs),
      e_bonus: numberOrBlank(projection?.e_bonus),
      e_defcon: numberOrBlank(projection?.e_defcon),
      prior_blend: numberOrBlank(projection?.prior_blend),
      historical_nineties: numberOrBlank(prior?.nineties),
      historical_points_per_90: numberOrBlank(prior?.points_per_90),
      projection_route: projection ? "engine" : "MISSING_ENGINE_PROJECTION",
      model_version: projection?.model_version ?? "",
      computed_at: projection?.computed_at ?? "",
    };
  });

  return {
    rows,
    generation: {
      gw,
      model_version: generation.modelVersion,
      run_started_at: generation.runStartedAt,
      run_finished_at: generation.computedAt,
      current_rows: generation.rows.length,
      stale_rows_excluded: generation.staleRows.length,
      active_players: activePlayers.length,
      missing_engine_rows: rows.filter((row) => row.projection_route !== "engine").length,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = resolve(outIndex >= 0 ? args[outIndex + 1] : process.env.OUT || "xpts-live-validation/projections.csv");
  const metaIndex = args.indexOf("--meta");
  const meta = resolve(metaIndex >= 0 ? args[metaIndex + 1] : process.env.META || "xpts-live-validation/generation.json");
  const gw = Number(process.env.GW) || await activeGameweek();

  // Use select=* for the small reference tables. The live Supabase schema stores
  // canonical ZEUS columns (price, position, chance_of_playing, team_id), while
  // some older code also understood raw FPL aliases. Requesting those aliases
  // explicitly makes PostgREST reject the whole export when a column is absent.
  const [players, teams, projections, priors] = await Promise.all([
    pageAll("players", "*", "archive=eq.false"),
    pageAll("teams", "*", "archive=eq.false"),
    pageAll("projections", "*", `gw=eq.${gw}&order=computed_at.desc`),
    pageAll("player_prior_season", "*"),
  ]);

  const built = buildValidationRows({ players, teams, projections, priors, gw });
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(dirname(meta), { recursive: true });
  writeFileSync(out, rowsToCsv(built.rows));
  writeFileSync(meta, JSON.stringify(built.generation, null, 2) + "\n");
  console.log(JSON.stringify({ csv: out, metadata: meta, ...built.generation }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
