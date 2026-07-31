const timeOf = (row) => {
  const value = Date.parse(row?.computed_at ?? "");
  return Number.isFinite(value) ? value : null;
};

const playerKey = (row, index) => {
  const id = Number(row?.player_id);
  return Number.isFinite(id) ? `player:${id}` : `row:${index}`;
};

function latestRunBatch(candidates, gapMinutes = 20, maxSpanMinutes = 120) {
  const timed = candidates
    .map((row, index) => ({ row, index, time: timeOf(row) }))
    .filter((entry) => entry.time !== null)
    .sort((a, b) => b.time - a.time);
  const untimed = candidates.filter((row) => timeOf(row) === null);
  if (!timed.length) return { current: [], stale: [...candidates], newest: null, oldest: null };

  const gapMs = Math.max(1, Number(gapMinutes) || 20) * 60 * 1000;
  const maxSpanMs = Math.max(Number(gapMinutes) || 20, Number(maxSpanMinutes) || 120) * 60 * 1000;
  const newest = timed[0].time;
  let previous = newest;
  let end = 1;
  for (; end < timed.length; end += 1) {
    const entry = timed[end];
    if (previous - entry.time > gapMs || newest - entry.time > maxSpanMs) break;
    previous = entry.time;
  }

  const batch = timed.slice(0, end);
  const older = timed.slice(end).map((entry) => entry.row);

  // Keep the newest row per player inside the run. A repeated player row in the
  // same run should not appear twice in the API response, but it is not deleted
  // by the timestamp cleanup because it belongs to the current write window.
  const deduped = new Map();
  for (const entry of batch) {
    const key = playerKey(entry.row, entry.index);
    if (!deduped.has(key)) deduped.set(key, entry.row);
  }

  const current = [...deduped.values()];
  const oldest = Math.min(...batch.map((entry) => entry.time));
  return {
    current,
    stale: [...older, ...untimed],
    newest,
    oldest,
  };
}

export function currentGeneration(rows, requestedGw = null, options = {}) {
  const candidates = [...(rows || [])]
    .filter((row) => requestedGw === null || Number(row?.gw) === Number(requestedGw));
  if (!candidates.length) {
    return {
      rows: [], staleRows: [], modelVersion: null, computedAt: null,
      runStartedAt: null, cutoffExclusive: null,
    };
  }

  const batch = latestRunBatch(
    candidates,
    options.gapMinutes ?? 20,
    options.maxSpanMinutes ?? 120,
  );

  if (batch.current.length) {
    const newestRow = batch.current
      .slice()
      .sort((a, b) => (timeOf(b) ?? 0) - (timeOf(a) ?? 0))[0];
    const runStartedAt = new Date(batch.oldest).toISOString();
    return {
      rows: batch.current,
      staleRows: batch.stale,
      modelVersion: newestRow?.model_version ?? null,
      computedAt: new Date(batch.newest).toISOString(),
      runStartedAt,
      cutoffExclusive: runStartedAt,
    };
  }

  // Defensive fallback for a legacy table with no computed_at values.
  const head = candidates.find((row) => String(row?.model_version ?? "").trim());
  const modelVersion = head ? String(head.model_version) : null;
  const current = modelVersion === null
    ? [...candidates]
    : candidates.filter((row) => String(row?.model_version ?? "") === modelVersion);
  const stale = modelVersion === null
    ? []
    : candidates.filter((row) => String(row?.model_version ?? "") !== modelVersion);
  return {
    rows: current,
    staleRows: stale,
    modelVersion,
    computedAt: null,
    runStartedAt: null,
    cutoffExclusive: null,
  };
}

export function generationsByGameweek(rows, options = {}) {
  const byGw = new Map();
  for (const row of rows || []) {
    const gw = Number(row?.gw);
    if (!Number.isFinite(gw)) continue;
    const group = byGw.get(gw) || [];
    group.push(row);
    byGw.set(gw, group);
  }
  return new Map([...byGw].map(([gw, group]) => [gw, currentGeneration(group, gw, options)]));
}

const exactGenerationKey = (row) => {
  const computedAt = row?.computed_at ? new Date(row.computed_at).toISOString() : null;
  const modelVersion = String(row?.model_version || "").trim() || null;
  return computedAt && modelVersion ? `${computedAt}|${modelVersion}` : null;
};

/**
 * Select the newest complete exact-timestamp generation. A newer partial write is rejected and the
 * previous verified generation remains usable until replacement read-back succeeds.
 */
export function coherentProjectionGeneration(rows, {
  expectedGameweeks = [],
  expectedPlayerIdsByGameweek = new Map(),
} = {}) {
  const targetGws = [...new Set(expectedGameweeks.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const groups = new Map();
  const rejectedRows = [];
  for (const row of rows || []) {
    let key = null;
    try { key = exactGenerationKey(row); } catch { key = null; }
    if (!key) { rejectedRows.push(row); continue; }
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const candidates = [...groups.entries()].map(([key, groupRows]) => {
    const [computedAt, modelVersion] = key.split("|");
    const failures = [];
    const byGw = new Map();
    for (const row of groupRows) {
      const gw = Number(row?.gw);
      const list = byGw.get(gw) || [];
      list.push(row);
      byGw.set(gw, list);
    }
    for (const gw of targetGws) {
      const gwRows = byGw.get(gw) || [];
      if (!gwRows.length) failures.push({ kind: "missing_gameweek", gw });
      const actual = gwRows.map((row) => Number(row.player_id));
      if (new Set(actual).size !== actual.length) failures.push({ kind: "duplicate_player_gameweek", gw });
      const expected = expectedPlayerIdsByGameweek instanceof Map ? expectedPlayerIdsByGameweek.get(gw) : null;
      if (expected) {
        const expectedSet = expected instanceof Set ? expected : new Set(expected);
        const actualSet = new Set(actual);
        const missing = [...expectedSet].filter((id) => !actualSet.has(Number(id)));
        const unexpected = [...actualSet].filter((id) => !expectedSet.has(Number(id)));
        if (missing.length) failures.push({ kind: "missing_players", gw, player_ids: missing });
        if (unexpected.length) failures.push({ kind: "unexpected_players", gw, player_ids: unexpected });
      }
    }
    return { rows: groupRows, computedAt, modelVersion, failures, pass: failures.length === 0 };
  }).sort((a, b) => Date.parse(b.computedAt) - Date.parse(a.computedAt));

  const selected = candidates.find((candidate) => candidate.pass);
  if (!selected) {
    const error = new Error("no complete coherent projection generation is available");
    error.code = "NO_COMPLETE_PROJECTION_GENERATION";
    error.candidates = candidates.map(({ computedAt, modelVersion, failures }) => ({ computedAt, modelVersion, failures }));
    throw error;
  }
  return {
    ...selected,
    rejectedGenerations: candidates.filter((candidate) => candidate !== selected),
    staleRows: [
      ...rejectedRows,
      ...candidates.filter((candidate) => candidate !== selected).flatMap((candidate) => candidate.rows),
    ],
  };
}

export const __projectionGenerationTest = { latestRunBatch, timeOf, exactGenerationKey };
