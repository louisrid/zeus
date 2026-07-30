import { writeFileSync } from "node:fs";
import { generationsByGameweek } from "../lib/projection_generation.mjs";

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
  if (!BASE || !KEY) throw new Error("Supabase URL/service key is missing for projection integrity");
  const response = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 700)}`);
  return text ? JSON.parse(text) : null;
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const missing = (value) => value === null || value === undefined || value === "";
const pos = (player) => {
  const raw = player?.position ?? player?.element_type;
  const number = Number(raw);
  if (Number.isInteger(number) && number >= 1 && number <= 4) return [null, "GK", "DEF", "MID", "FWD"][number];
  const text = String(raw ?? "").toUpperCase();
  return text === "GKP" ? "GK" : text;
};
const price = (player) => {
  const raw = finite(player?.now_cost ?? player?.price);
  return raw !== null && raw > 20 ? raw / 10 : raw;
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function olderThanFilter(gw, cutoffIso) {
  return `projections?gw=eq.${gw}&computed_at=lt.${encodeURIComponent(cutoffIso)}`;
}

export function untimedFilter(gw) {
  return `projections?gw=eq.${gw}&computed_at=is.null`;
}

async function remove(path) {
  const removed = await request(path, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(removed) ? removed.length : 0;
}

function playerMaps(players) {
  const internal = new Map();
  const fpl = new Map();
  for (const player of players || []) {
    if (Number.isFinite(Number(player?.id))) internal.set(Number(player.id), player);
    const fplId = Number(player?.fpl_id ?? player?.element);
    if (Number.isFinite(fplId)) fpl.set(fplId, player);
  }
  return { internal, fpl };
}

export function auditGeneration(generation, players = []) {
  const maps = playerMaps(players);
  const details = generation.rows.map((row) => {
    const player = maps.internal.get(Number(row.player_id)) ?? maps.fpl.get(Number(row.player_id)) ?? {};
    return {
      row,
      player,
      name: player.web_name ?? player.name ?? `player ${row.player_id}`,
      team: Number(player.team_id ?? player.team),
      position: pos(player),
      price: price(player),
      xpts: finite(row.ep_mean),
      minutes: finite(row.r_exp_minutes),
      start: finite(row.r_p_start),
    };
  });

  const projectedIds = new Set(generation.rows.map((row) => Number(row.player_id)));
  const missingEngine = (players || [])
    .filter((player) => player && player.archive !== true && Number.isFinite(Number(player.id)))
    .filter((player) => !projectedIds.has(Number(player.id)))
    .map((player) => ({
      row: { player_id: player.id }, player, name: player.web_name ?? player.name ?? `player ${player.id}`,
      team: Number(player.team_id ?? player.team), position: pos(player), price: price(player),
      xpts: null, minutes: null, start: null,
    }));

  const missingProvenance = details.filter(({ row }) =>
    missing(row.r_exp_minutes)
    || missing(row.r_p_start)
    || missing(row.minutes_source)
    || missing(row.rate_source)
    || missing(row.lambda_team)
    || missing(row.lambda_opponent));
  const namedLow = details.filter(({ row, start }) => row.minutes_source === "lineup-starter" && (start === null || start < 0.8));
  const zeroWithoutReason = details.filter(({ row, xpts }) => xpts !== null && xpts < 0.1 && row.minutes_source !== "unavailable");
  const highMinutesLow = details.filter(({ row, minutes, xpts }) =>
    minutes !== null && minutes >= 75 && xpts !== null && xpts < 1.25 && row.minutes_source !== "unavailable");
  const namedStarterLow = details.filter(({ row, minutes, xpts }) =>
    row.minutes_source === "lineup-starter" && minutes !== null && minutes >= 70 && xpts !== null && xpts < 1.5);
  const goalkeeperLow = details.filter(({ row, position, minutes, xpts }) =>
    position === "GK" && minutes !== null && minutes >= 75 && xpts !== null && xpts < 1.5 && row.minutes_source !== "unavailable");
  const premiumAttackerLow = details.filter(({ row, position, price: cost, minutes, xpts }) =>
    ["MID", "FWD"].includes(position) && cost !== null && cost >= 8.5
    && minutes !== null && minutes >= 70 && xpts !== null && xpts < 2.25 && row.minutes_source !== "unavailable");

  const defenderOutliers = [];
  const byTeam = new Map();
  for (const detail of details) {
    if (detail.position !== "DEF" || detail.minutes === null || detail.minutes < 70 || detail.xpts === null) continue;
    const group = byTeam.get(detail.team) || [];
    group.push(detail);
    byTeam.set(detail.team, group);
  }
  for (const group of byTeam.values()) {
    if (group.length < 3) continue;
    const clubMedian = median(group.map((item) => item.xpts));
    if (clubMedian === null || clubMedian < 2.4) continue;
    for (const item of group) {
      if (item.xpts < Math.max(1.25, clubMedian - 1.75)) defenderOutliers.push(item);
    }
  }

  const groups = {
    missing_engine_projection: missingEngine,
    missing_provenance: missingProvenance,
    named_starters_below_080: namedLow,
    unexplained_near_zero: zeroWithoutReason,
    high_minutes_below_125: highMinutesLow,
    named_starters_below_150: namedStarterLow,
    high_minute_goalkeepers_below_150: goalkeeperLow,
    premium_attackers_below_225: premiumAttackerLow,
    same_team_defender_outliers: defenderOutliers,
  };
  const critical = Object.entries(groups).flatMap(([kind, items]) => items.map((item) => ({
    kind,
    player_id: item.row.player_id,
    name: item.name,
    xpts: item.xpts,
    expected_minutes: item.minutes,
    start_probability: item.start,
    minutes_source: item.row.minutes_source ?? null,
  })));
  return { groups, critical };
}

export async function cleanupStaleProjections({ enforce = true } = {}) {
  const [rows, players] = await Promise.all([
    request("projections?select=*&order=computed_at.desc.nullslast&limit=12000"),
    request("players?select=*&limit=2500"),
  ]);
  const generations = generationsByGameweek(rows || []);
  const now = Date.now();
  const report = { generated_at: new Date().toISOString(), gameweeks: [], deleted_rows: 0, failures: [] };

  for (const [gw, generation] of generations) {
    const newest = Date.parse(generation.computedAt ?? "");
    if (!Number.isFinite(newest) || now - newest > 12 * 60 * 60 * 1000) continue;
    if (generation.rows.length < 50) {
      report.failures.push({ gw, kind: "incomplete_generation", current_rows: generation.rows.length });
      continue;
    }

    let deletedForGw = 0;
    if (generation.staleRows.length && generation.cutoffExclusive) {
      deletedForGw += await remove(olderThanFilter(gw, generation.cutoffExclusive));
      if (generation.staleRows.some((row) => !row.computed_at)) deletedForGw += await remove(untimedFilter(gw));
    }

    const audit = auditGeneration(generation, players || []);
    report.deleted_rows += deletedForGw;
    report.failures.push(...audit.critical.map((failure) => ({ gw, ...failure })));
    report.gameweeks.push({
      gw,
      model_version: generation.modelVersion,
      run_started_at: generation.runStartedAt,
      run_finished_at: generation.computedAt,
      current_rows: generation.rows.length,
      stale_rows_found: generation.staleRows.length,
      stale_rows_deleted: deletedForGw,
      ...Object.fromEntries(Object.entries(audit.groups).map(([key, value]) => [key, value.length])),
    });
    console.log(`GW${gw}: kept ${generation.rows.length} current rows; removed ${deletedForGw} stale rows; found ${audit.critical.length} integrity failures`);
  }

  writeFileSync("projection-integrity-v14-report.json", JSON.stringify(report, null, 2) + "\n");
  if (report.failures.length) {
    const preview = report.failures.slice(0, 12).map((failure) =>
      `GW${failure.gw} ${failure.name ?? "generation"}: ${failure.kind}`).join("; ");
    const message = `Projection integrity found ${report.failures.length} issue(s): ${preview}`;
    if (enforce) throw new Error(message);
    console.warn(`${message}. Validation mode keeps the fresh generation available for export and diagnosis.`);
  } else {
    console.log(`Projection integrity complete. Removed ${report.deleted_rows} stale rows and accepted the current generation.`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupStaleProjections().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export const __projectionIntegrityTest = { olderThanFilter, untimedFilter, auditGeneration };
