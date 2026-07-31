import { coherentProjectionGeneration, generationsByGameweek } from "./projection_generation.mjs";

const finiteId = (value) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

const playerLabel = (player) => player?.web_name || player?.name || `player ${player?.id ?? "?"}`;

/**
 * Select one coherent projection generation per gameweek and build the maps used by both
 * browser and server loaders. Raw Supabase row order must never decide which projection wins.
 */
export function buildProjectionRuntime(rows, {
  currentGw,
  idToFpl,
  expectedGameweeks = [],
  expectedPlayerIdsByGameweek = new Map(),
} = {}) {
  const coherent = expectedGameweeks.length
    ? coherentProjectionGeneration(rows || [], { expectedGameweeks, expectedPlayerIdsByGameweek })
    : null;
  const generations = generationsByGameweek(coherent ? coherent.rows : (rows || []));
  const projections = new Map();
  const perGw = new Map();
  const staleRows = coherent ? [...coherent.staleRows] : [];
  const selectedRows = [];

  for (const [gw, generation] of generations) {
    staleRows.push(...generation.staleRows);
    for (const row of generation.rows) {
      const internalId = finiteId(row?.player_id);
      if (internalId === null) continue;
      const fplId = idToFpl instanceof Map ? idToFpl.get(internalId) : internalId;
      if (fplId === null || fplId === undefined) continue;

      selectedRows.push(row);
      if (Number(gw) === Number(currentGw)) projections.set(fplId, row);
      const q = row.quantiles || {};
      const series = perGw.get(fplId) || [];
      series.push({
        gw: Number(gw),
        ep_mean: Number(row.ep_mean),
        p10: Number(q.p10 ?? q.p5 ?? 0),
        p90: Number(q.p90 ?? q.p95 ?? 0),
        row,
      });
      perGw.set(fplId, series);
    }
  }

  for (const series of perGw.values()) series.sort((a, b) => a.gw - b.gw);

  return {
    projections,
    perGw,
    generations,
    currentGeneration: generations.get(Number(currentGw)) || null,
    selectedRows,
    staleRows,
    coherentGeneration: coherent,
  };
}

/**
 * The UI is engine-only. If the current generation is incomplete, fail visibly instead of
 * manufacturing final xPTS from a different model for the missing players.
 */
export function assertCurrentEngineCoverage({ projections, players, currentGw, limit = 12 } = {}) {
  const eligible = (players || []).filter((player) =>
    player && player.archive !== true && player.fpl_id !== null && player.fpl_id !== undefined);
  const missing = eligible.filter((player) => !projections?.has(player.fpl_id));
  if (!missing.length) return { eligible: eligible.length, covered: eligible.length, missing: [] };

  const names = missing.slice(0, limit).map(playerLabel).join(", ");
  const more = missing.length > limit ? ` and ${missing.length - limit} more` : "";
  const error = new Error(
    `GW${currentGw}: projection generation is incomplete. Missing engine rows for ${missing.length} of ${eligible.length} active players: ${names}${more}.`,
  );
  error.name = "ProjectionCoverageError";
  error.code = "INCOMPLETE_ENGINE_GENERATION";
  error.currentGw = Number(currentGw);
  error.covered = eligible.length - missing.length;
  error.eligible = eligible.length;
  error.missingPlayers = missing.map((player) => ({
    id: player.id,
    fpl_id: player.fpl_id,
    name: playerLabel(player),
    team_id: player.team_id,
  }));
  throw error;
}

export function projectionReadError(error, context = "projections") {
  const detail = error?.message || String(error || "unknown error");
  const out = new Error(`${context} could not be loaded: ${detail}`);
  out.name = "ProjectionReadError";
  out.code = "PROJECTION_READ_FAILED";
  out.cause = error;
  return out;
}
