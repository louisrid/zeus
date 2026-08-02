const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;
const DEFAULT_GENERATION_GAP_MINUTES = 20;
const DEFAULT_GENERATION_SPAN_MINUTES = 120;

const asString = (value) => String(value ?? "").trim();

export const finiteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normaliseSearchText(value) {
  return asString(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalisePrice(player) {
  const raw = finiteNumber(player?.price ?? player?.now_cost);
  if (raw === null) return null;
  return raw > 20 ? raw / 10 : raw;
}

export function normaliseOwnership(player) {
  return finiteNumber(
    player?.selected_by_percent
      ?? player?.selected_by
      ?? player?.ownership
      ?? player?.own,
  );
}

export function normalisePosition(player) {
  const raw = player?.position ?? player?.element_type;
  const numeric = finiteNumber(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) {
    return [null, "GKP", "DEF", "MID", "FWD"][numeric];
  }
  const text = asString(raw).toUpperCase();
  return text === "GK" ? "GKP" : text || null;
}

export function parseList(value) {
  if (Array.isArray(value)) return value.flatMap(parseList).filter(Boolean);
  return asString(value).split(",").map((item) => item.trim()).filter(Boolean);
}

const readParam = (input, key) => {
  if (!input) return undefined;
  if (typeof input.get === "function") return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
};

const readBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const readInteger = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
};

export function parsePlayerQueryParams(input = {}) {
  const gwFrom = readInteger(readParam(input, "gw_from") ?? readParam(input, "gwFrom"), 1);
  const gwTo = readInteger(readParam(input, "gw_to") ?? readParam(input, "gwTo"), gwFrom);
  const limit = readInteger(readParam(input, "limit"), DEFAULT_PAGE_SIZE);
  const offset = readInteger(readParam(input, "offset"), 0);
  const topNPerClubRaw = readParam(input, "top_n_per_club") ?? readParam(input, "topNPerClub");
  const topNPerClub = topNPerClubRaw === undefined || topNPerClubRaw === ""
    ? null
    : readInteger(topNPerClubRaw, null);

  if (!Number.isInteger(gwFrom) || !Number.isInteger(gwTo) || gwFrom < 1 || gwTo > 38 || gwFrom > gwTo) {
    throw new RangeError("Require 1 <= gw_from <= gw_to <= 38");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError("offset must be a non-negative integer");
  if (topNPerClub !== null && (!Number.isInteger(topNPerClub) || topNPerClub < 1 || topNPerClub > 100)) {
    throw new RangeError("top_n_per_club must be an integer from 1 to 100");
  }

  const priceMin = finiteNumber(readParam(input, "price_min") ?? readParam(input, "priceMin"));
  const priceMax = finiteNumber(readParam(input, "price_max") ?? readParam(input, "priceMax"));
  const ownershipMin = finiteNumber(readParam(input, "ownership_min") ?? readParam(input, "ownershipMin"));
  const ownershipMax = finiteNumber(readParam(input, "ownership_max") ?? readParam(input, "ownershipMax"));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) throw new RangeError("price_min cannot exceed price_max");
  if (ownershipMin !== null && ownershipMax !== null && ownershipMin > ownershipMax) {
    throw new RangeError("ownership_min cannot exceed ownership_max");
  }

  return {
    gwFrom,
    gwTo,
    clubs: parseList(readParam(input, "clubs") ?? readParam(input, "club")).map((value) => value.toUpperCase()),
    positions: parseList(readParam(input, "positions") ?? readParam(input, "position")).map((value) => value.toUpperCase()),
    name: asString(readParam(input, "name") ?? readParam(input, "q")),
    priceMin,
    priceMax,
    ownershipMin,
    ownershipMax,
    sortBy: asString((readParam(input, "sort_by") ?? readParam(input, "sortBy")) || "xpts").toLowerCase(),
    sortDirection: asString((readParam(input, "sort_direction") ?? readParam(input, "sortDirection")) || "desc").toLowerCase(),
    topNPerClub,
    includeBreakdown: readBoolean(readParam(input, "include_breakdown") ?? readParam(input, "includeBreakdown"), false),
    limit,
    offset,
  };
}

const rowTime = (row) => {
  const timestamp = Date.parse(row?.computed_at ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
};

const explicitGenerationId = (row) => {
  for (const key of ["generation_id", "projection_generation_id", "run_id", "batch_id"]) {
    const value = asString(row?.[key]);
    if (value) return value;
  }
  return null;
};

export function selectLatestGeneration(rows, {
  gapMinutes = DEFAULT_GENERATION_GAP_MINUTES,
  maxSpanMinutes = DEFAULT_GENERATION_SPAN_MINUTES,
} = {}) {
  const candidates = [...(rows || [])];
  if (!candidates.length) {
    return {
      rows: [], staleRows: [], generationId: null, modelVersion: null,
      computedAt: null, runStartedAt: null,
    };
  }

  const timed = candidates
    .map((row, index) => ({ row, index, time: rowTime(row) }))
    .filter((entry) => entry.time !== null)
    .sort((a, b) => b.time - a.time || a.index - b.index);
  const untimed = candidates.filter((row) => rowTime(row) === null);

  if (!timed.length) {
    const head = candidates.find((row) => asString(row?.model_version));
    const modelVersion = head ? asString(head.model_version) : null;
    const current = modelVersion
      ? candidates.filter((row) => asString(row?.model_version) === modelVersion)
      : candidates;
    return {
      rows: current,
      staleRows: modelVersion ? candidates.filter((row) => asString(row?.model_version) !== modelVersion) : [],
      generationId: explicitGenerationId(current[0]) || (modelVersion ? `${modelVersion}@legacy` : "legacy"),
      modelVersion,
      computedAt: null,
      runStartedAt: null,
    };
  }

  const newest = timed[0];
  const explicit = explicitGenerationId(newest.row);
  let batch;
  let older;
  if (explicit) {
    batch = timed.filter((entry) => explicitGenerationId(entry.row) === explicit);
    older = timed.filter((entry) => explicitGenerationId(entry.row) !== explicit).map((entry) => entry.row);
  } else {
    const gapMs = Math.max(1, Number(gapMinutes) || DEFAULT_GENERATION_GAP_MINUTES) * 60_000;
    const maxSpanMs = Math.max(Number(maxSpanMinutes) || DEFAULT_GENERATION_SPAN_MINUTES, Number(gapMinutes) || DEFAULT_GENERATION_GAP_MINUTES) * 60_000;
    let previous = newest.time;
    let end = 1;
    for (; end < timed.length; end += 1) {
      const entry = timed[end];
      if (previous - entry.time > gapMs || newest.time - entry.time > maxSpanMs) break;
      previous = entry.time;
    }
    batch = timed.slice(0, end);
    older = timed.slice(end).map((entry) => entry.row);
  }

  const deduped = new Map();
  const duplicates = [];
  for (const entry of batch) {
    const id = finiteNumber(entry.row?.player_id);
    const key = id === null ? `row:${entry.index}` : `player:${id}`;
    if (!deduped.has(key)) deduped.set(key, entry.row);
    else duplicates.push(entry.row);
  }

  const currentRows = [...deduped.values()];
  const times = batch.map((entry) => entry.time);
  const computedAt = new Date(Math.max(...times)).toISOString();
  const runStartedAt = new Date(Math.min(...times)).toISOString();
  const modelVersion = asString(newest.row?.model_version) || null;
  return {
    rows: currentRows,
    staleRows: [...duplicates, ...older, ...untimed],
    generationId: explicit || `${modelVersion || "unknown-model"}@${runStartedAt}`,
    modelVersion,
    computedAt,
    runStartedAt,
  };
}

export function selectLatestGenerationsByGameweek(rows, gwFrom = 1, gwTo = 38, options = {}) {
  const grouped = new Map();
  for (const row of rows || []) {
    const gw = finiteNumber(row?.gw);
    if (!Number.isInteger(gw) || gw < gwFrom || gw > gwTo) continue;
    if (!grouped.has(gw)) grouped.set(gw, []);
    grouped.get(gw).push(row);
  }
  const result = new Map();
  for (let gw = gwFrom; gw <= gwTo; gw += 1) {
    result.set(gw, selectLatestGeneration(grouped.get(gw) || [], options));
  }
  return result;
}

export function sumGameweekValues({ gwFrom, gwTo, read }) {
  let total = 0;
  let seen = 0;
  const values = {};
  for (let gw = gwFrom; gw <= gwTo; gw += 1) {
    const value = finiteNumber(read(gw));
    values[String(gw)] = value;
    if (value !== null) {
      total += value;
      seen += 1;
    }
  }
  return { total: seen ? total : null, seen, values };
}

export function resolveClub({ player, projection, teamById }) {
  const diagnostics = projection?.quantiles?.diagnostics || {};
  const teamId = finiteNumber(
    diagnostics.resolved_team_id
      ?? projection?.resolved_team_id
      ?? player?.team_id
      ?? player?.team,
  );
  const team = teamId === null ? null : teamById.get(Number(teamId));
  return {
    teamId,
    code: asString(team?.short_name || team?.code || team?.name) || null,
    name: asString(team?.name || team?.short_name || team?.code) || null,
  };
}

const projectionDetail = (row) => ({
  gw: finiteNumber(row?.gw),
  xpts: finiteNumber(row?.ep_mean),
  expected_minutes: finiteNumber(row?.r_exp_minutes),
  start_probability: finiteNumber(row?.r_p_start),
});

export function buildPlayerProjectionRows({
  playerRows = [],
  teamRows = [],
  projectionRows = [],
  gwFrom = 1,
  gwTo = 38,
  includeBreakdown = false,
} = {}) {
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  const generations = selectLatestGenerationsByGameweek(projectionRows, gwFrom, gwTo);
  const projectionsByPlayer = new Map();
  const generationMetadata = {};

  for (const [gw, generation] of generations) {
    generationMetadata[String(gw)] = {
      generation_id: generation.generationId,
      model_version: generation.modelVersion,
      timestamp: generation.computedAt,
      run_started_at: generation.runStartedAt,
      current_rows: generation.rows.length,
      stale_rows_excluded: generation.staleRows.length,
    };
    for (const row of generation.rows) {
      const playerId = finiteNumber(row?.player_id);
      if (playerId === null) continue;
      if (!projectionsByPlayer.has(playerId)) projectionsByPlayer.set(playerId, new Map());
      projectionsByPlayer.get(playerId).set(gw, row);
    }
  }

  const output = [];
  for (const player of playerRows) {
    const playerId = finiteNumber(player?.id);
    if (playerId === null) continue;
    const perPlayer = projectionsByPlayer.get(playerId) || new Map();
    const firstProjection = [...perPlayer.values()][0] || null;
    const club = resolveClub({ player, projection: firstProjection, teamById });
    const gameweeks = {};
    let totalXpts = 0;
    let projectedGameweeks = 0;
    let expectedMinutesTotal = 0;
    let expectedMinutesSeen = 0;
    let startProbabilityTotal = 0;
    let startProbabilitySeen = 0;

    for (let gw = gwFrom; gw <= gwTo; gw += 1) {
      const projection = perPlayer.get(gw) || null;
      const detail = projection ? projectionDetail(projection) : {
        gw, xpts: null, expected_minutes: null, start_probability: null,
      };
      if (detail.xpts !== null) {
        totalXpts += detail.xpts;
        projectedGameweeks += 1;
      }
      if (detail.expected_minutes !== null) {
        expectedMinutesTotal += detail.expected_minutes;
        expectedMinutesSeen += 1;
      }
      if (detail.start_probability !== null) {
        startProbabilityTotal += detail.start_probability;
        startProbabilitySeen += 1;
      }
      if (includeBreakdown) gameweeks[String(gw)] = detail;
    }

    const price = normalisePrice(player);
    const total = projectedGameweeks ? totalXpts : null;
    output.push({
      player_id: playerId,
      fpl_id: finiteNumber(player?.fpl_id ?? player?.element),
      name: asString(player?.web_name || player?.name || player?.second_name) || `Player ${playerId}`,
      full_name: [player?.first_name, player?.second_name].filter(Boolean).join(" ") || null,
      club: club.code,
      club_name: club.name,
      team_id: club.teamId,
      position: normalisePosition(player),
      status: player?.status ?? null,
      price,
      ownership: normaliseOwnership(player),
      total_xpts: total,
      xpts_per_million: total !== null && price !== null && price > 0 ? total / price : null,
      expected_minutes_total: expectedMinutesSeen ? expectedMinutesTotal : null,
      start_probability_average: startProbabilitySeen ? startProbabilityTotal / startProbabilitySeen : null,
      projected_gameweeks: projectedGameweeks,
      missing_gameweeks: (gwTo - gwFrom + 1) - projectedGameweeks,
      ...(includeBreakdown ? { gameweeks } : {}),
    });
  }

  const nonEmptyGenerations = Object.values(generationMetadata).filter((item) => item.current_rows > 0);
  const generationIds = [...new Set(nonEmptyGenerations.map((item) => item.generation_id).filter(Boolean))];
  const modelVersions = [...new Set(nonEmptyGenerations.map((item) => item.model_version).filter(Boolean))];
  const timestamps = nonEmptyGenerations.map((item) => item.timestamp).filter(Boolean).sort();
  const runStarts = nonEmptyGenerations.map((item) => item.run_started_at).filter(Boolean).sort();
  return {
    rows: output,
    metadata: {
      generation_id: generationIds.length === 1
        ? generationIds[0]
        : `${modelVersions.join("+") || "unknown-model"}@${runStarts[0] || timestamps.at(-1) || "legacy"}`,
      model_version: modelVersions.length === 1 ? modelVersions[0] : (modelVersions.length ? `mixed:${modelVersions.join(",")}` : null),
      timestamp: timestamps.at(-1) || null,
      run_started_at: runStarts[0] || null,
      generations: generationMetadata,
    },
  };
}

export function filterPlayerRows(rows, {
  clubs = [], positions = [], name = "", priceMin = null, priceMax = null,
  ownershipMin = null, ownershipMax = null,
} = {}) {
  const clubSet = new Set(parseList(clubs).map((value) => value.toUpperCase()));
  const positionSet = new Set(parseList(positions).map((value) => value.toUpperCase()));
  const nameNeedle = normaliseSearchText(name);
  return [...(rows || [])].filter((row) => {
    if (clubSet.size && !clubSet.has(asString(row?.club).toUpperCase())) return false;
    if (positionSet.size && !positionSet.has(asString(row?.position).toUpperCase())) return false;
    if (nameNeedle) {
      const haystack = normaliseSearchText(`${row?.name || ""} ${row?.full_name || ""}`);
      if (!haystack.includes(nameNeedle)) return false;
    }
    const price = finiteNumber(row?.price);
    const ownership = finiteNumber(row?.ownership);
    if (priceMin !== null && (price === null || price < priceMin)) return false;
    if (priceMax !== null && (price === null || price > priceMax)) return false;
    if (ownershipMin !== null && (ownership === null || ownership < ownershipMin)) return false;
    if (ownershipMax !== null && (ownership === null || ownership > ownershipMax)) return false;
    return true;
  });
}

const SORT_ALIASES = new Map([
  ["xpts", "total_xpts"], ["total_xpts", "total_xpts"],
  ["points_per_million", "xpts_per_million"], ["ppm", "xpts_per_million"],
  ["value", "xpts_per_million"], ["xpts_per_million", "xpts_per_million"],
  ["price", "price"], ["ownership", "ownership"], ["name", "name"],
  ["club", "club"], ["position", "position"], ["sort_value", "sort_value"],
]);

export function canonicalSortKey(sortBy = "xpts") {
  return SORT_ALIASES.get(asString(sortBy).toLowerCase()) || "total_xpts";
}

export function comparePlayerRows(a, b, { sortBy = "xpts", sortDirection = "desc" } = {}) {
  const key = canonicalSortKey(sortBy);
  const direction = asString(sortDirection).toLowerCase() === "asc" ? 1 : -1;
  const av = a?.[key];
  const bv = b?.[key];
  const aMissing = av === null || av === undefined || (typeof av === "number" && !Number.isFinite(av));
  const bMissing = bv === null || bv === undefined || (typeof bv === "number" && !Number.isFinite(bv));
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (!aMissing) {
    const primary = typeof av === "string" || typeof bv === "string"
      ? String(av).localeCompare(String(bv), "en", { sensitivity: "base", numeric: true })
      : Number(av) - Number(bv);
    if (primary !== 0) return primary * direction;
  }
  const nameTie = normaliseSearchText(a?.name).localeCompare(normaliseSearchText(b?.name), "en", { numeric: true });
  if (nameTie !== 0) return nameTie;
  const clubTie = asString(a?.club).localeCompare(asString(b?.club), "en", { sensitivity: "base", numeric: true });
  if (clubTie !== 0) return clubTie;
  return (finiteNumber(a?.player_id) ?? Number.MAX_SAFE_INTEGER) - (finiteNumber(b?.player_id) ?? Number.MAX_SAFE_INTEGER);
}

export function sortPlayerRows(rows, options = {}) {
  return [...(rows || [])].sort((a, b) => comparePlayerRows(a, b, options));
}

export function applyTopNPerClub(rows, topNPerClub, options = {}, requestedClubs = []) {
  if (!Number.isInteger(topNPerClub) || topNPerClub < 1) return [...(rows || [])];
  const sorted = sortPlayerRows(rows, options);
  const groups = new Map();
  for (const row of sorted) {
    const club = asString(row?.club).toUpperCase() || "UNKNOWN";
    if (!groups.has(club)) groups.set(club, []);
    if (groups.get(club).length < topNPerClub) groups.get(club).push(row);
  }
  const preferred = parseList(requestedClubs).map((value) => value.toUpperCase());
  const remaining = [...groups.keys()].filter((club) => !preferred.includes(club)).sort();
  const order = [...preferred.filter((club) => groups.has(club)), ...remaining];
  return order.flatMap((club) => groups.get(club));
}

export function paginateRows(rows, { limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const matchedCount = rows.length;
  const page = rows.slice(offset, offset + limit);
  const complete = offset + page.length >= matchedCount;
  return {
    rows: page,
    matchedCount,
    returnedCount: page.length,
    complete,
    truncated: !complete,
    nextOffset: complete ? null : offset + page.length,
  };
}

export function queryPlayerRows({ playerRows, teamRows, projectionRows }, rawParams = {}) {
  const params = rawParams.gwFrom ? rawParams : parsePlayerQueryParams(rawParams);
  const built = buildPlayerProjectionRows({
    playerRows, teamRows, projectionRows,
    gwFrom: params.gwFrom,
    gwTo: params.gwTo,
    includeBreakdown: params.includeBreakdown,
  });
  const filtered = filterPlayerRows(built.rows, params);
  const sorted = sortPlayerRows(filtered, { sortBy: params.sortBy, sortDirection: params.sortDirection });
  const topNRows = applyTopNPerClub(sorted, params.topNPerClub, {
    sortBy: params.sortBy,
    sortDirection: params.sortDirection,
  }, params.clubs);
  const page = paginateRows(topNRows, params);
  return {
    ok: true,
    season: "2026-27",
    competition: "PL",
    gw_from: params.gwFrom,
    gw_to: params.gwTo,
    generation_id: built.metadata.generation_id,
    model_version: built.metadata.model_version,
    model: built.metadata.model_version,
    timestamp: built.metadata.timestamp,
    run_started_at: built.metadata.run_started_at,
    generation_by_gameweek: built.metadata.generations,
    matched_count_before_top_n: filtered.length,
    matched_count: page.matchedCount,
    returned_count: page.returnedCount,
    complete: page.complete,
    truncated: page.truncated,
    next_offset: page.nextOffset,
    limit: params.limit,
    offset: params.offset,
    sorted_by: canonicalSortKey(params.sortBy),
    sort_direction: params.sortDirection === "asc" ? "asc" : "desc",
    tie_break: "normalised player name ascending, club ascending, player_id ascending",
    top_n_per_club: params.topNPerClub,
    include_breakdown: params.includeBreakdown,
    filters: {
      clubs: params.clubs,
      positions: params.positions,
      name: params.name || null,
      price_min: params.priceMin,
      price_max: params.priceMax,
      ownership_min: params.ownershipMin,
      ownership_max: params.ownershipMax,
    },
    players: page.rows,
  };
}


export const PLAYER_QUERY_LIMITS = Object.freeze({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maximumPageSize: MAX_PAGE_SIZE,
});
