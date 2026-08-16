import DATA from "../config/external-xpts-2026-27.mjs";
import { lineupGateCoversGameweek } from "./lineup-xpts.mjs";

export const EXTERNAL_XPTS_SOURCE = DATA.source;
export const EXTERNAL_XPTS_MODEL_VERSION = "external-fplcopilot-2026-08-03";
export const EXTERNAL_XPTS_GW_FROM = Number(DATA.gw_from) || 1;

/* TWO HORIZONS, DELIBERATELY.
 *
 * `gw_to` is how far the file *stores* values. `gw_served_to` is how far the product will actually
 * project. They are separate because carrying data is cheap and trusting it is not: the export runs to
 * GW38, but only the near weeks are treated as a real projection, and serving a number the source cannot
 * stand behind is worse than returning nothing at all.
 *
 * To extend the projection later, raise `gw_served_to` in config/external-xpts-2026-27.mjs. That is the
 * only edit required: the gameweek list, the zero series, the API's supported range and the UI all read
 * from here. Nothing needs reimporting, because the values are already in the file. */
export const EXTERNAL_XPTS_STORED_GW_TO = Number(DATA.gw_to) || 8;
export const EXTERNAL_XPTS_GW_TO = Math.min(
  Number(DATA.gw_served_to) || Number(DATA.gw_to) || 8,
  EXTERNAL_XPTS_STORED_GW_TO,
);
export const EXTERNAL_XPTS_IMPORTED_AT = DATA.imported_at;
export const EXTERNAL_XPTS_GAMEWEEKS = Array.from(
  { length: EXTERNAL_XPTS_GW_TO - EXTERNAL_XPTS_GW_FROM + 1 },
  (_, index) => EXTERNAL_XPTS_GW_FROM + index,
);

const ZERO_SERIES = Object.freeze(Array(EXTERNAL_XPTS_GAMEWEEKS.length).fill(0));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const numberOrZero = (value) => finite(value) ?? 0;

function normaliseLineupGate(options = {}) {
  const supplied = options.lineupStartingIds instanceof Set ? options.lineupStartingIds : null;
  const startingIds = supplied
    ? new Set([...supplied].map(Number).filter(Number.isFinite))
    : new Set();
  return {
    active: Boolean(supplied),
    startingIds,
    report: options.lineupGateReport || null,
  };
}

export function normaliseExternalName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerNameKeys(player) {
  const values = [
    player?.web_name,
    player?.name,
    player?.second_name,
    [player?.first_name, player?.second_name].filter(Boolean).join(" "),
  ];
  return [...new Set(values.map(normaliseExternalName).filter(Boolean))];
}

function prominence(player) {
  const ownership = finite(player?.own ?? player?.selected_by_pct ?? player?.selected_by_percent) ?? 0;
  const price = finite(player?.price ?? player?.now_cost) ?? 0;
  const minutes = finite(player?.minutes) ?? 0;
  const id = finite(player?.fpl_id ?? player?.element ?? player?.id) ?? 0;
  return [ownership, price, minutes, -id];
}

function comparePlayers(a, b) {
  const av = prominence(a);
  const bv = prominence(b);
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return String(a?.web_name ?? "").localeCompare(String(b?.web_name ?? ""));
}

function sourceGroups() {
  const groups = new Map();
  for (const row of DATA.rows || []) {
    const key = normaliseExternalName(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      ...row,
      xpts: Array.isArray(row.xpts) ? row.xpts.map(numberOrZero).slice(0, EXTERNAL_XPTS_GAMEWEEKS.length) : [...ZERO_SERIES],
      minutes: Array.isArray(row.minutes) ? row.minutes.map(numberOrZero).slice(0, EXTERNAL_XPTS_GAMEWEEKS.length) : [...ZERO_SERIES],
      total: numberOrZero(row.total),
      display_minutes: numberOrZero(row.display_minutes),
    });
  }
  for (const rows of groups.values()) rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return groups;
}

function zeroRecord(player, status, sourceName = null) {
  return {
    player,
    sourceName,
    status,
    xpts: [...ZERO_SERIES],
    minutes: [...ZERO_SERIES],
    total: 0,
    displayMinutes: 0,
  };
}

/* IDENTITY BY ID, WHERE THE IMPORT SUPPLIES ONE.
 *
 * Name matching is what produced the old warnings about duplicate display names and unmatched players.
 * Two Fletchers at one club contend for a single row; a player who has changed club resolves against the
 * club the export was written against rather than the one he now plays for. Neither can happen when the
 * export carries the official FPL element id, so ids are consumed first and the name path is left intact
 * for any row that lacks one. */
function matchExternalPlayersById(list) {
  const rowsById = new Map();
  for (const row of DATA.rows || []) {
    const id = finite(row.fpl_id);
    if (id === null) continue;
    rowsById.set(id, row);
  }
  if (!rowsById.size) return null;

  const byFplId = new Map();
  let matched = 0;
  for (const player of list) {
    const id = Number(player?.fpl_id ?? player?.element ?? player?.id);
    const row = rowsById.get(id);
    if (!row) {
      byFplId.set(id, zeroRecord(player, "zeroed-unmatched"));
      continue;
    }
    matched += 1;
    const length = EXTERNAL_XPTS_GAMEWEEKS.length;
    byFplId.set(id, {
      player,
      sourceName: row.source_name ?? row.name ?? null,
      status: "matched",
      xpts: Array.isArray(row.xpts) ? row.xpts.map(numberOrZero).slice(0, length) : [...ZERO_SERIES],
      minutes: Array.isArray(row.minutes) ? row.minutes.map(numberOrZero).slice(0, length) : [...ZERO_SERIES],
      total: numberOrZero(row.total),
      displayMinutes: numberOrZero(row.display_minutes),
    });
  }

  const importedIds = new Set(rowsById.keys());
  for (const player of list) importedIds.delete(Number(player?.fpl_id ?? player?.element ?? player?.id));

  return {
    byFplId,
    report: {
      identity: "fpl_id",
      source_rows: (DATA.rows || []).length,
      fpl_players: list.length,
      matched_players: matched,
      zeroed_duplicate_players: 0,
      zeroed_unmatched_players: list.length - matched,
      unmatched_source_rows: [...importedIds].map((id) => ({ fpl_id: id, name: rowsById.get(id)?.name ?? null })),
      duplicate_groups: [],
    },
  };
}

export function matchExternalPlayers(players = []) {
  const list = Array.isArray(players) ? players : [];
  const byId = matchExternalPlayersById(list);
  if (byId) return byId;
  const sourceByKey = sourceGroups();
  const primaryPlayersByKey = new Map();
  const anyPlayersByKey = new Map();

  for (const player of list) {
    const primary = normaliseExternalName(player?.web_name);
    if (primary) {
      if (!primaryPlayersByKey.has(primary)) primaryPlayersByKey.set(primary, []);
      primaryPlayersByKey.get(primary).push(player);
    }
    for (const key of playerNameKeys(player)) {
      if (!anyPlayersByKey.has(key)) anyPlayersByKey.set(key, []);
      anyPlayersByKey.get(key).push(player);
    }
  }
  for (const values of primaryPlayersByKey.values()) values.sort(comparePlayers);
  for (const values of anyPlayersByKey.values()) values.sort(comparePlayers);

  const byFplId = new Map();
  const assignedPlayers = new Set();
  const matchedSourceKeys = new Set();
  const duplicateGroups = [];

  const groups = [...sourceByKey.entries()].sort((a, b) => {
    const score = (b[1][0]?.total ?? 0) - (a[1][0]?.total ?? 0);
    return score || a[0].localeCompare(b[0]);
  });

  for (const [key, sourceRows] of groups) {
    let candidates = (primaryPlayersByKey.get(key) || []).filter((player) => !assignedPlayers.has(player));
    if (!candidates.length) candidates = (anyPlayersByKey.get(key) || []).filter((player) => !assignedPlayers.has(player));
    if (!candidates.length) continue;

    candidates = [...new Set(candidates)].sort(comparePlayers);
    const primaryPlayer = candidates[0];
    const primaryRow = sourceRows[0];
    const primaryId = Number(primaryPlayer.fpl_id ?? primaryPlayer.element ?? primaryPlayer.id);
    byFplId.set(primaryId, {
      player: primaryPlayer,
      sourceName: primaryRow.name,
      status: sourceRows.length > 1 || candidates.length > 1 ? "matched-primary-duplicate-group" : "matched",
      xpts: [...primaryRow.xpts],
      minutes: [...primaryRow.minutes],
      total: primaryRow.total,
      displayMinutes: primaryRow.display_minutes,
    });
    assignedPlayers.add(primaryPlayer);
    matchedSourceKeys.add(key);

    if (sourceRows.length > 1 || candidates.length > 1) {
      const zeroed = [];
      for (const player of candidates.slice(1)) {
        const id = Number(player.fpl_id ?? player.element ?? player.id);
        byFplId.set(id, zeroRecord(player, "zeroed-duplicate-name", primaryRow.name));
        assignedPlayers.add(player);
        zeroed.push({ fpl_id: id, name: player.web_name ?? player.name ?? String(id) });
      }
      duplicateGroups.push({
        normalised_name: key,
        kept_source_name: primaryRow.name,
        kept_source_total: primaryRow.total,
        kept_fpl_id: primaryId,
        kept_player: primaryPlayer.web_name ?? primaryPlayer.name ?? String(primaryId),
        ignored_source_rows: sourceRows.slice(1).map((row) => ({ name: row.name, total: row.total })),
        zeroed_players: zeroed,
      });
    }
  }

  for (const player of list) {
    const id = Number(player.fpl_id ?? player.element ?? player.id);
    if (!byFplId.has(id)) byFplId.set(id, zeroRecord(player, "zeroed-unmatched"));
  }

  const unmatchedSourceRows = [];
  for (const [key, rows] of sourceByKey) {
    if (!matchedSourceKeys.has(key)) unmatchedSourceRows.push(...rows.map((row) => ({ name: row.name, total: row.total })));
  }
  const values = [...byFplId.values()];
  return {
    byFplId,
    report: {
      source_rows: (DATA.rows || []).length,
      fpl_players: list.length,
      matched_players: values.filter((record) => record.status.startsWith("matched")).length,
      zeroed_duplicate_players: values.filter((record) => record.status === "zeroed-duplicate-name").length,
      zeroed_unmatched_players: values.filter((record) => record.status === "zeroed-unmatched").length,
      unmatched_source_rows: unmatchedSourceRows,
      duplicate_groups: duplicateGroups,
    },
  };
}

function rowForGw(record, gw, playerId, gate) {
  const index = Number(gw) - EXTERNAL_XPTS_GW_FROM;
  if (!Number.isInteger(index) || index < 0 || index >= EXTERNAL_XPTS_GAMEWEEKS.length) return null;
  const rawXpts = numberOrZero(record?.xpts?.[index]);
  const rawMinutes = numberOrZero(record?.minutes?.[index]);
  /* The imported xPTS now runs the whole season, but a predicted line-up is only evidence for the window
     it was published against. Inside that window a player outside every published eleven scores zero;
     outside it the gate has nothing to say and the imported value stands. */
  const gated = lineupGateCoversGameweek(gate, gw);
  const predictedStart = gated ? gate.startingIds.has(Number(playerId)) : null;
  const effectiveXpts = predictedStart === false ? 0 : rawXpts;
  const effectiveMinutes = predictedStart === false ? 0 : rawMinutes;
  const startProbability = predictedStart === null
    ? Math.max(0, Math.min(1, rawMinutes / 90))
    : (predictedStart ? 1 : 0);
  return {
    gw: Number(gw),
    ep_mean: effectiveXpts,
    raw_ep_mean: rawXpts,
    r_exp_minutes: effectiveMinutes,
    raw_r_exp_minutes: rawMinutes,
    r_p_start: startProbability,
    r_p_cameo: null,
    predicted_start: predictedStart,
    lineup_snapshot_gw: gated ? 1 : null,
    minutes_source: gated ? "external-import+predicted-lineup-gate" : "external-fplcopilot-import",
    rate_source: gated ? "external-import+predicted-lineup-gate" : "external-fplcopilot-import",
    model_version: EXTERNAL_XPTS_MODEL_VERSION,
    computed_at: EXTERNAL_XPTS_IMPORTED_AT,
    source_name: record?.sourceName ?? null,
    match_status: gated && !predictedStart
      ? "zeroed-not-predicted-lineup"
      : (record?.status ?? "zeroed-unmatched"),
  };
}

export function buildExternalProjectionModel(players = [], options = {}) {
  const currentGw = Number.isInteger(Number(options.currentGw)) ? Number(options.currentGw) : EXTERNAL_XPTS_GW_FROM;
  const lastSeasonPointsByFpl = options.lastSeasonPointsByFpl instanceof Map ? options.lastSeasonPointsByFpl : new Map();
  const gate = normaliseLineupGate(options);
  const { byFplId, report } = matchExternalPlayers(players);
  const perGw = new Map();
  const minutes = new Map();

  for (const player of players) {
    const id = Number(player.fpl_id ?? player.element ?? player.id);
    const record = byFplId.get(id) || zeroRecord(player, "zeroed-unmatched");
    const series = EXTERNAL_XPTS_GAMEWEEKS.map((gw) => rowForGw(record, gw, id, gate));
    perGw.set(id, series);
    const current = rowForGw(record, currentGw, id, gate);
    if (current) minutes.set(id, {
      gw: currentGw,
      exp_minutes: current.r_exp_minutes,
      r_exp_minutes: current.r_exp_minutes,
      p_start: current.r_p_start,
      r_p_start: current.r_p_start,
      p_cameo: null,
      r_p_cameo: null,
      exp_min_start: current.r_exp_minutes,
      exp_min_cameo: 0,
      minutes_source: current.minutes_source,
      model_version: EXTERNAL_XPTS_MODEL_VERSION,
    });
  }

  const playerIdOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
  const recordOf = (player) => byFplId.get(playerIdOf(player));
  const rowOf = (player, gw) => rowForGw(recordOf(player), Number(gw), playerIdOf(player), gate);
  const scoreForGw = (player, gw) => rowOf(player, gw)?.ep_mean ?? null;
  const rawScoreForGw = (player, gw) => rowOf(player, gw)?.raw_ep_mean ?? null;
  const minutesForGw = (player, gw) => rowOf(player, gw)?.r_exp_minutes ?? null;
  const rawMinutesForGw = (player, gw) => rowOf(player, gw)?.raw_r_exp_minutes ?? null;
  const startProbForGw = (player, gw) => rowOf(player, gw)?.r_p_start ?? null;
  const predictedStartOf = (player) => gate.active ? gate.startingIds.has(playerIdOf(player)) : null;
  const scoreOf = (player) => scoreForGw(player, currentGw);
  const sourceOf = (player) => {
    const row = rowOf(player, currentGw);
    return row?.match_status ?? recordOf(player)?.status ?? "zeroed-unmatched";
  };

  return {
    scoreOf,
    scoreForGw,
    rawScoreForGw,
    sourceOf,
    routeOf: sourceOf,
    staleOf: () => ({ stale: false }),
    bandOf: (player) => ({ p10: null, p50: scoreOf(player), p90: null, real: false }),
    tailOf: () => null,
    floorOf: () => null,
    rateCapped: () => 0,
    minutes,
    perGw,
    minutesForecasts: minutes,
    minutesOf: (player) => minutes.get(Number(player?.fpl_id ?? player?.element ?? player?.id)) || null,
    minutesForGw,
    rawMinutesForGw,
    startProbOf: (player) => startProbForGw(player, currentGw),
    startProbForGw,
    predictedStartOf,
    lastSeasonPoints: (player) => lastSeasonPointsByFpl.get(Number(player?.fpl_id ?? player?.element ?? player?.id)) ?? null,
    envByTeam: new Map(),
    envByTeamGw: new Map(),
    gateOpen: true,
    engineRows: 0,
    engineCoverage: 0,
    externalRows: report.matched_players,
    externalCoverage: players.length ? report.matched_players / players.length : 0,
    livePlayers: players.length,
    oddsRows: 0,
    projectionGeneration: EXTERNAL_XPTS_MODEL_VERSION,
    staleProjectionRowsExcluded: 0,
    resolvedTeamChanges: [],
    projectedGws: [...EXTERNAL_XPTS_GAMEWEEKS],
    gw: currentGw,
    externalSource: EXTERNAL_XPTS_SOURCE,
    externalImportAt: EXTERNAL_XPTS_IMPORTED_AT,
    matchReport: { ...report, lineup_gate: gate.report },
    lineupGate: gate,
    recordOf,
  };
}

export function buildExternalProjectionRows(players = [], options = {}) {
  const model = buildExternalProjectionModel(players, options);
  const output = [];
  for (const player of players) {
    const fplId = Number(player.fpl_id ?? player.element ?? player.id);
    const record = model.recordOf(player);
    const gatedTotal = EXTERNAL_XPTS_GAMEWEEKS.reduce((sum, gw) => sum + numberOrZero(model.scoreForGw(player, gw)), 0);
    for (const gw of EXTERNAL_XPTS_GAMEWEEKS) {
      const row = model.perGw.get(fplId)?.find((item) => item?.gw === gw) || null;
      const xpts = numberOrZero(row?.ep_mean);
      const rawXpts = numberOrZero(row?.raw_ep_mean);
      const expectedMinutes = numberOrZero(row?.r_exp_minutes);
      const rawExpectedMinutes = numberOrZero(row?.raw_r_exp_minutes);
      output.push({
        gw,
        player_id: Number(player.id ?? fplId),
        fpl_id: fplId,
        name: player.web_name ?? player.name ?? player.second_name ?? `Player ${fplId}`,
        full_name: [player.first_name, player.second_name].filter(Boolean).join(" ") || player.name || null,
        team: player.team ?? player.team_short ?? player.team_name ?? null,
        team_id: finite(player.team_id ?? player.team),
        position: player.position ?? player.element_type ?? null,
        price: finite(player.price ?? player.now_cost),
        ownership: finite(player.own ?? player.selected_by_pct ?? player.selected_by_percent),
        xpts,
        xp: xpts,
        raw_imported_xpts: rawXpts,
        xpts_total_8gw: gatedTotal,
        raw_xpts_total_8gw: numberOrZero(record?.total),
        expected_minutes: expectedMinutes,
        raw_expected_minutes: rawExpectedMinutes,
        start_probability: row?.r_p_start ?? null,
        predicted_start: row?.predicted_start ?? null,
        lineup_snapshot_gw: row?.lineup_snapshot_gw ?? null,
        cameo_probability: null,
        clean_sheet_probability: null,
        expected_goals: null,
        expected_assists: null,
        expected_bonus: null,
        expected_defcon: null,
        lambda_team: null,
        lambda_opponent: null,
        minutes_source: row?.minutes_source ?? "external-fplcopilot-import",
        rate_source: row?.rate_source ?? "external-fplcopilot-import",
        model_version: EXTERNAL_XPTS_MODEL_VERSION,
        computed_at: EXTERNAL_XPTS_IMPORTED_AT,
        match_status: row?.match_status ?? record?.status ?? "zeroed-unmatched",
        source_name: record?.sourceName ?? null,
      });
    }
  }
  return { rows: output, report: model.matchReport, model };
}
