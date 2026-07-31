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

function pagedPath(path, offset, limit) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}offset=${offset}&limit=${limit}`;
}

export async function collectAllPages(fetchPage, { pageSize = 500, maxRows = 100000 } = {}) {
  const size = Math.max(1, Number(pageSize) || 500);
  const ceiling = Math.max(size, Number(maxRows) || 100000);
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await fetchPage(offset, size);
    if (!Array.isArray(page)) throw new Error("paginated Supabase read did not return an array");
    if (!page.length) break;
    rows.push(...page);
    offset += page.length;
    if (rows.length > ceiling) {
      throw new Error(`paginated Supabase read exceeded the ${ceiling} row safety limit`);
    }
  }
  return rows;
}

async function requestAll(path, options = {}) {
  return collectAllPages(
    (offset, limit) => request(pagedPath(path, offset, limit)),
    options,
  );
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
      cameo: finite(row.r_p_cameo),
    };
  });

  const projectedIds = new Set(generation.rows.map((row) => Number(row.player_id)));
  const missingEngine = (players || [])
    .filter((player) => player && player.archive !== true && Number.isFinite(Number(player.id)))
    .filter((player) => !projectedIds.has(Number(player.id)))
    .map((player) => ({
      row: { player_id: player.id }, player, name: player.web_name ?? player.name ?? `player ${player.id}`,
      team: Number(player.team_id ?? player.team), position: pos(player), price: price(player),
      xpts: null, minutes: null, start: null, cameo: null,
    }));

  const missingProvenance = details.filter(({ row }) =>
    missing(row.r_exp_minutes)
    || missing(row.r_p_start)
    || missing(row.minutes_source)
    || missing(row.rate_source)
    || missing(row.lambda_team)
    || missing(row.lambda_opponent));
  const namedLow = details.filter(({ row, start }) => row.minutes_source === "lineup-starter" && (start === null || start < 0.8));
  /* A near-zero projection is only a blocker when the player has meaningful expected exposure. Bench
     players with a tiny cameo chance and backup goalkeepers can legitimately sit below 0.1 xPTS. The old
     unconditional rule turned more than one hundred valid low-exposure rows into a production failure. */
  const hasMeaningfulExposure = ({ minutes, start, cameo }) =>
    (minutes !== null && minutes >= 10)
    || (start !== null && start >= 0.1)
    || (cameo !== null && cameo >= 0.25);
  const zeroWithoutReason = details.filter((detail) =>
    detail.xpts !== null && detail.xpts < 0.1
    && detail.row.minutes_source !== "unavailable"
    && hasMeaningfulExposure(detail));
  const lowExposureNearZero = details.filter((detail) =>
    detail.xpts !== null && detail.xpts < 0.1
    && detail.row.minutes_source !== "unavailable"
    && !hasMeaningfulExposure(detail));
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

  const criticalGroups = {
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
  const warningGroups = {
    low_exposure_near_zero: lowExposureNearZero,
  };
  const asFailures = (groups) => Object.entries(groups).flatMap(([kind, items]) => items.map((item) => ({
    kind,
    player_id: item.row.player_id,
    name: item.name,
    xpts: item.xpts,
    expected_minutes: item.minutes,
    start_probability: item.start,
    cameo_probability: item.cameo,
    minutes_source: item.row.minutes_source ?? null,
  })));
  const critical = asFailures(criticalGroups);
  const warnings = asFailures(warningGroups);
  return { groups: { ...criticalGroups, ...warningGroups }, criticalGroups, warningGroups, critical, warnings };
}

const sameInstant = (left, right) => {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

export function expectedGenerationFailures(
  gameweeks = [],
  expectedGameweeks = [],
  expectedPlayersPerGameweek = null,
  expectedComputedAt = null,
) {
  const byGw = new Map((gameweeks || []).map((gameweek) => [Number(gameweek.gw), gameweek]));
  const expectedPlayers = finite(expectedPlayersPerGameweek);
  const failures = [];
  for (const value of expectedGameweeks || []) {
    const gw = Number(value);
    if (!Number.isInteger(gw)) continue;
    const actual = byGw.get(gw);
    if (!actual) {
      failures.push({ gw, kind: "missing_gameweek_generation", current_rows: 0 });
      continue;
    }
    const currentRows = Number(actual.current_rows) || 0;
    if (expectedPlayers !== null && currentRows !== expectedPlayers) {
      failures.push({
        gw,
        kind: "incomplete_gameweek_generation",
        current_rows: currentRows,
        expected_rows: expectedPlayers,
      });
    }
    if (expectedComputedAt && !sameInstant(actual.run_finished_at, expectedComputedAt)) {
      failures.push({
        gw,
        kind: "wrong_projection_run",
        expected_computed_at: expectedComputedAt,
        actual_computed_at: actual.run_finished_at ?? null,
      });
    }
    if (expectedComputedAt && expectedPlayers !== null && currentRows === expectedPlayers
      && sameInstant(actual.run_finished_at, expectedComputedAt)) {
      const exactRunRows = finite(actual.expected_run_rows)
        ?? (sameInstant(actual.run_finished_at, expectedComputedAt) ? currentRows : 0);
      if (exactRunRows !== expectedPlayers) {
        failures.push({
          gw,
          kind: "mixed_or_incomplete_projection_run",
          current_rows: currentRows,
          expected_run_rows: exactRunRows,
          expected_rows: expectedPlayers,
          expected_computed_at: expectedComputedAt,
        });
      }
    }
  }
  return failures;
}

export function blockingProjectionFailures({
  structuralFailures = [],
  qualityFailures = [],
  enforceQuality = true,
} = {}) {
  return [
    ...(structuralFailures || []),
    ...(enforceQuality ? (qualityFailures || []) : []),
  ];
}

export async function cleanupStaleProjections({
  enforce = true,
  expectedGameweeks = [],
  expectedPlayersPerGameweek = null,
  expectedComputedAt = null,
} = {}) {
  const targetGameweeks = [...new Set((expectedGameweeks || []).map(Number).filter(Number.isInteger))]
    .sort((a, b) => a - b);
  const gameweekFilter = targetGameweeks.length
    ? `&gw=in.(${targetGameweeks.join(",")})`
    : "";
  const projectionQuery = `projections?select=*${gameweekFilter}&order=gw.asc,computed_at.desc.nullslast,player_id.asc,model_version.asc`;
  const [rows, players] = await Promise.all([
    requestAll(projectionQuery, { pageSize: 500, maxRows: 100000 }),
    requestAll("players?select=*&order=id.asc", { pageSize: 500, maxRows: 10000 }),
  ]);
  const generations = generationsByGameweek(rows || []);
  const exactRowsByGameweek = new Map();
  if (expectedComputedAt) {
    for (const row of rows || []) {
      if (!sameInstant(row?.computed_at, expectedComputedAt)) continue;
      const gw = Number(row?.gw);
      exactRowsByGameweek.set(gw, (exactRowsByGameweek.get(gw) || 0) + 1);
    }
  }
  const now = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    expected_gameweeks: targetGameweeks,
    expected_players_per_gameweek: finite(expectedPlayersPerGameweek),
    expected_computed_at: expectedComputedAt || null,
    fetched_projection_rows: rows.length,
    fetched_player_rows: players.length,
    gameweeks: [],
    deleted_rows: 0,
    structural_failures: [],
    quality_failures: [],
    blocking_failures: [],
    failures: [],
    warnings: [],
  };

  const recentGenerations = new Map();
  for (const [gw, generation] of generations) {
    const newest = Date.parse(generation.computedAt ?? "");
    if (!Number.isFinite(newest) || now - newest > 12 * 60 * 60 * 1000) continue;
    recentGenerations.set(gw, generation);
    const expectedRunRows = expectedComputedAt
      ? (exactRowsByGameweek.get(Number(gw)) || 0)
      : generation.rows.length;
    if (generation.rows.length < 50) {
      report.structural_failures.push({ gw, kind: "incomplete_generation", current_rows: generation.rows.length });
      report.gameweeks.push({
        gw,
        model_version: generation.modelVersion,
        run_started_at: generation.runStartedAt,
        run_finished_at: generation.computedAt,
        current_rows: generation.rows.length,
        expected_run_rows: expectedRunRows,
        stale_rows_found: generation.staleRows.length,
        stale_rows_deleted: 0,
      });
      continue;
    }

    const audit = auditGeneration(generation, players || []);
    report.quality_failures.push(...audit.critical.map((failure) => ({ gw, ...failure })));
    report.warnings.push(...audit.warnings.map((warning) => ({ gw, ...warning })));
    report.gameweeks.push({
      gw,
      model_version: generation.modelVersion,
      run_started_at: generation.runStartedAt,
      run_finished_at: generation.computedAt,
      current_rows: generation.rows.length,
      expected_run_rows: expectedRunRows,
      stale_rows_found: generation.staleRows.length,
      stale_rows_deleted: 0,
      ...Object.fromEntries(Object.entries(audit.groups).map(([key, value]) => [key, value.length])),
    });
  }

  report.gameweeks.sort((a, b) => Number(a.gw) - Number(b.gw));
  report.structural_failures.push(...expectedGenerationFailures(
    report.gameweeks,
    report.expected_gameweeks,
    report.expected_players_per_gameweek,
    report.expected_computed_at,
  ));

  const cleanupAllowed = report.structural_failures.length === 0
    && (!enforce || report.quality_failures.length === 0);
  if (cleanupAllowed) {
    for (const [gw, generation] of recentGenerations) {
      if (!generation.staleRows.length) continue;
      try {
        let deletedForGw = 0;
        if (expectedComputedAt && targetGameweeks.includes(Number(gw))) {
          deletedForGw += await remove(`projections?gw=eq.${gw}&computed_at=neq.${encodeURIComponent(expectedComputedAt)}`);
          deletedForGw += await remove(untimedFilter(gw));
        } else if (generation.cutoffExclusive) {
          deletedForGw += await remove(olderThanFilter(gw, generation.cutoffExclusive));
          if (generation.staleRows.some((row) => !row.computed_at)) {
            deletedForGw += await remove(untimedFilter(gw));
          }
        }
        report.deleted_rows += deletedForGw;
        const item = report.gameweeks.find((entry) => Number(entry.gw) === Number(gw));
        if (item) item.stale_rows_deleted = deletedForGw;
      } catch (error) {
        report.structural_failures.push({
          gw,
          kind: "stale_projection_cleanup_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!report.structural_failures.length && expectedComputedAt && targetGameweeks.length) {
      try {
        const persisted = await requestAll(projectionQuery, { pageSize: 500, maxRows: 100000 });
        const counts = new Map();
        const staleCounts = new Map();
        for (const row of persisted) {
          const gw = Number(row?.gw);
          if (sameInstant(row?.computed_at, expectedComputedAt)) {
            counts.set(gw, (counts.get(gw) || 0) + 1);
          } else {
            staleCounts.set(gw, (staleCounts.get(gw) || 0) + 1);
          }
        }
        for (const gw of targetGameweeks) {
          const exactRows = counts.get(gw) || 0;
          const staleRows = staleCounts.get(gw) || 0;
          if (report.expected_players_per_gameweek !== null
            && exactRows !== report.expected_players_per_gameweek) {
            report.structural_failures.push({
              gw,
              kind: "post_cleanup_exact_run_mismatch",
              current_rows: exactRows,
              expected_rows: report.expected_players_per_gameweek,
            });
          }
          if (staleRows) {
            report.structural_failures.push({
              gw,
              kind: "stale_rows_remain_after_cleanup",
              stale_rows: staleRows,
            });
          }
        }
      } catch (error) {
        report.structural_failures.push({
          gw: null,
          kind: "post_cleanup_verification_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  report.failures = [...report.structural_failures, ...report.quality_failures];
  report.blocking_failures = blockingProjectionFailures({
    structuralFailures: report.structural_failures,
    qualityFailures: report.quality_failures,
    enforceQuality: enforce,
  });
  report.pass = report.blocking_failures.length === 0;

  writeFileSync("projection-integrity-v14-report.json", JSON.stringify(report, null, 2) + "\n");
  if (report.blocking_failures.length) {
    const preview = report.blocking_failures.slice(0, 12).map((failure) =>
      `GW${failure.gw ?? "?"} ${failure.name ?? "generation"}: ${failure.kind}`).join("; ");
    const message = `Projection integrity found ${report.blocking_failures.length} blocking issue(s): ${preview}`;
    throw new Error(message);
  }
  if (report.quality_failures.length) {
    const preview = report.quality_failures.slice(0, 12).map((failure) =>
      `GW${failure.gw} ${failure.name ?? "generation"}: ${failure.kind}`).join("; ");
    console.warn(
      `Projection integrity found ${report.quality_failures.length} football-quality issue(s): ${preview}. `
      + "Validation mode keeps the structurally complete generation available for export and diagnosis.",
    );
  } else {
    console.log(`Projection integrity complete. Fetched ${report.fetched_projection_rows} projection rows, removed ${report.deleted_rows} stale rows and accepted the current generation${report.warnings.length ? ` with ${report.warnings.length} low-exposure warning(s)` : ""}.`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupStaleProjections().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export const __projectionIntegrityTest = {
  olderThanFilter,
  untimedFilter,
  auditGeneration,
  expectedGenerationFailures,
  blockingProjectionFailures,
  sameInstant,
  collectAllPages,
  pagedPath,
};
