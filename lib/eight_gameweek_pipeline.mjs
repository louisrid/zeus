import { auditFixtureRows, fixtureIdentity, isCurrentOrUpcomingFixture } from "./fixture_rows.mjs";

const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : null;
const uniqueSorted = (values) => [...new Set(values.map(integer).filter((value) => value !== null))].sort((a, b) => a - b);
const activePlayers = (players) => (players || []).filter((player) => player?.archive !== true && player?.active !== false);
const rowKey = (row) => `${integer(row?.player_id)}:${integer(row?.gw)}`;

export function eightGameweeks(startGameweek = 1) {
  const start = integer(startGameweek);
  if (start === null || start < 1 || start > 31) throw new Error(`invalid projection start gameweek: ${startGameweek}`);
  return Array.from({ length: 8 }, (_, index) => start + index);
}

export function generationVersion(baseVersion, computedAt) {
  const base = String(baseVersion || "projection").trim();
  const time = new Date(computedAt);
  if (!Number.isFinite(time.getTime())) throw new Error(`invalid generation timestamp: ${computedAt}`);
  return `${base}+run.${time.toISOString().replace(/[-:.TZ]/g, "")}`;
}

export function validateProjectionGeneration({
  targetGws = [],
  fixtures = [],
  players = [],
  rows = [],
  simulatedFixtureIds = [],
  computedAt = null,
  modelVersion = null,
} = {}) {
  const targets = uniqueSorted(targetGws);
  const targetSet = new Set(targets);
  const simulated = simulatedFixtureIds instanceof Set ? simulatedFixtureIds : new Set(simulatedFixtureIds);
  const failures = [];
  const gameweeks = [];
  const expectedTimestamp = computedAt ? new Date(computedAt).toISOString() : null;
  const expectedPlayers = activePlayers(players);

  if (targets.length !== 8) failures.push({ kind: "gameweek_count", expected: 8, actual: targets.length });
  if (targets.some((gw, index) => index && gw !== targets[index - 1] + 1)) failures.push({ kind: "non_contiguous_gameweeks" });

  for (const row of rows) {
    if (!targetSet.has(integer(row?.gw))) failures.push({ kind: "unexpected_gameweek_row", gw: row?.gw, player_id: row?.player_id });
    const actualTime = row?.computed_at ? new Date(row.computed_at) : null;
    const actualTimestamp = actualTime && Number.isFinite(actualTime.getTime())
      ? actualTime.toISOString()
      : null;
    if (expectedTimestamp && actualTimestamp !== expectedTimestamp) failures.push({
      kind: "mixed_computed_at",
      expected: expectedTimestamp,
      actual: actualTimestamp,
      raw: row?.computed_at,
    });
    if (modelVersion && row?.model_version !== modelVersion) failures.push({ kind: "mixed_model_version", expected: modelVersion, actual: row?.model_version });
  }

  for (const gw of targets) {
    const fixturesForGw = fixtures.filter((fixture) => integer(fixture?.gw) === gw);
    const fixtureIds = fixturesForGw.map(fixtureIdentity);
    const teamIds = new Set(fixturesForGw.flatMap((fixture) => [integer(fixture.home_team), integer(fixture.away_team)]).filter(Boolean));
    const expectedIds = new Set(expectedPlayers.filter((player) => teamIds.has(integer(player.team_id))).map((player) => integer(player.id ?? player.player_id)));
    const rowsForGw = rows.filter((row) => integer(row?.gw) === gw);
    const actualIds = rowsForGw.map((row) => integer(row?.player_id));
    const actualSet = new Set(actualIds);
    const missing = [...expectedIds].filter((id) => !actualSet.has(id));
    const unexpected = [...actualSet].filter((id) => !expectedIds.has(id));
    const duplicates = actualIds.length - actualSet.size;
    const unsimulated = fixtureIds.filter((id) => !simulated.has(id));

    if (!fixturesForGw.length) failures.push({ kind: "incomplete_gameweek", gw });
    if (unsimulated.length) failures.push({ kind: "unsimulated_fixtures", gw, fixture_ids: unsimulated });
    if (missing.length) failures.push({ kind: "missing_players", gw, player_ids: missing });
    if (unexpected.length) failures.push({ kind: "unexpected_players", gw, player_ids: unexpected });
    if (duplicates) failures.push({ kind: "duplicate_player_gameweek", gw, count: duplicates });

    gameweeks.push({
      gw,
      fixtures: fixturesForGw.length,
      simulated_fixtures: fixtureIds.length - unsimulated.length,
      participating_clubs: teamIds.size,
      expected_players: expectedIds.size,
      actual_players: actualSet.size,
      rows: rowsForGw.length,
    });
  }

  return { pass: failures.length === 0, target_gameweeks: targets, gameweeks, failures };
}

export async function generateProjectionGeneration({
  fixtures = [], teams = [], players = [], startGameweek = 1,
  currentSeason = "2026-27", baseModelVersion = "projection",
  computedAt = new Date().toISOString(), projectFixture,
} = {}) {
  if (typeof projectFixture !== "function") throw new Error("projectFixture callback is required");
  const targetGws = eightGameweeks(startGameweek);
  const liveTeamIds = new Set((teams || []).filter((team) => team?.archive !== true).map((team) => Number(team.id)));
  const fixtureAudit = auditFixtureRows(fixtures, teams, { currentSeason, liveTeamIds });
  const relevantBlocking = fixtureAudit.blocking.filter((issue) => {
    const fixture = fixtureAudit.fixtures.find((row) => fixtureIdentity(row) === issue.fixture_id);
    return fixture && targetGws.includes(integer(fixture.gw));
  });
  if (relevantBlocking.length) {
    const error = new Error(`projection fixtures are invalid: ${relevantBlocking.map((issue) => `${issue.fixture_id}:${issue.kind}`).join(", ")}`);
    error.issues = relevantBlocking;
    throw error;
  }

  const selected = fixtureAudit.fixtures.filter((fixture) =>
    targetGws.includes(integer(fixture.gw))
    && isCurrentOrUpcomingFixture(fixture, { currentSeason, liveTeamIds }));
  const timestamp = new Date(computedAt).toISOString();
  const modelVersion = generationVersion(baseModelVersion, timestamp);
  const rows = [];
  const simulatedFixtureIds = new Set();

  for (const fixture of selected) {
    const generated = await projectFixture({ fixture, computedAt: timestamp, modelVersion });
    if (!Array.isArray(generated)) throw new Error(`fixture ${fixtureIdentity(fixture)} projector did not return rows`);
    rows.push(...generated.map((row) => ({ ...row, gw: fixture.gw, computed_at: timestamp, model_version: modelVersion })));
    simulatedFixtureIds.add(fixtureIdentity(fixture));
  }

  const validation = validateProjectionGeneration({
    targetGws, fixtures: selected, players, rows, simulatedFixtureIds, computedAt: timestamp, modelVersion,
  });
  if (!validation.pass) {
    const error = new Error(`projection generation failed structural validation: ${validation.failures.slice(0, 8).map((failure) => failure.kind).join(", ")}`);
    error.report = validation;
    throw error;
  }
  return { targetGws, fixtures: selected, players: activePlayers(players), rows, computedAt: timestamp, modelVersion, fixtureAudit, validation, simulatedFixtureIds };
}

export async function persistProjectionGeneration(generation, {
  writeGameweek,
  readBack,
  cleanupStale,
} = {}) {
  if (typeof writeGameweek !== "function" || typeof readBack !== "function" || typeof cleanupStale !== "function") {
    throw new Error("safe persistence requires writeGameweek, readBack and cleanupStale callbacks");
  }
  const preflight = validateProjectionGeneration({
    targetGws: generation.targetGws,
    fixtures: generation.fixtures,
    players: generation.players,
    rows: generation.rows,
    simulatedFixtureIds: generation.simulatedFixtureIds,
    computedAt: generation.computedAt,
    modelVersion: generation.modelVersion,
  });
  if (!preflight.pass) throw Object.assign(new Error("replacement generation failed pre-write validation"), { report: preflight });

  for (const gw of [...generation.targetGws].sort((a, b) => b - a)) {
    await writeGameweek(gw, generation.rows.filter((row) => Number(row.gw) === Number(gw)));
  }
  const storedRows = await readBack({ modelVersion: generation.modelVersion, computedAt: generation.computedAt });
  const readBackValidation = validateProjectionGeneration({
    targetGws: generation.targetGws,
    fixtures: generation.fixtures,
    players: generation.players,
    rows: storedRows,
    simulatedFixtureIds: generation.simulatedFixtureIds,
    computedAt: generation.computedAt,
    modelVersion: generation.modelVersion,
  });
  if (!readBackValidation.pass) {
    throw Object.assign(new Error("replacement generation failed read-back validation; stale cleanup was not run"), { report: readBackValidation });
  }
  await cleanupStale({ keepModelVersion: generation.modelVersion, keepComputedAt: generation.computedAt, targetGws: generation.targetGws });
  return { preflight, readBack: readBackValidation, storedRows };
}

export function projectionDataAudit({ fixtures = [], teams = [], players = [], gameweeks = [], projections = [], teamOverrides = new Map(), pagination = {}, readErrors = [] } = {}) {
  const targetGws = eightGameweeks(1);
  const fixtureAudit = auditFixtureRows(fixtures, teams);
  const issues = [
    ...fixtureAudit.issues,
    ...readErrors.map((failure) => ({
      kind: /pagination truncation/i.test(failure.error) ? "supabase_pagination_truncation" : "supabase_read_error",
      severity: "blocking",
      table: failure.table,
      error: failure.error,
    })),
  ];
  const teamIds = new Set(teams.filter((team) => team?.archive !== true).map((team) => integer(team.id)));
  for (const player of activePlayers(players)) {
    if (!teamIds.has(integer(player.team_id))) issues.push({ kind: "missing_current_team", severity: "blocking", player_id: player.id, team_id: player.team_id });
    const override = teamOverrides instanceof Map ? teamOverrides.get(player.fpl_id ?? player.id) : teamOverrides?.[player.fpl_id ?? player.id];
    if (override !== undefined && integer(override) !== integer(player.team_id)) issues.push({ kind: "transferred_player_team_mismatch", severity: "blocking", player_id: player.id, stored_team_id: player.team_id, resolved_team_id: override });
  }
  const seenProjection = new Set();
  for (const row of projections) {
    const key = rowKey(row);
    if (seenProjection.has(key)) issues.push({ kind: "duplicate_player_gameweek_projection", severity: "blocking", player_id: row.player_id, gw: row.gw });
    seenProjection.add(key);
  }
  const projectionTimes = new Set(projections.map((row) => row?.computed_at).filter(Boolean));
  if (projectionTimes.size > 1) issues.push({ kind: "mixed_computed_at_timestamps", severity: "blocking", count: projectionTimes.size });
  const presentGws = new Set(fixtures.filter((fixture) => fixture?.finished !== true).map((fixture) => integer(fixture.gw)));
  for (const gw of targetGws) if (!presentGws.has(gw)) issues.push({ kind: "incomplete_gameweek", severity: "blocking", gw });
  const declaredGws = new Set(gameweeks.map((row) => integer(row.gw)));
  for (const gw of targetGws) if (gameweeks.length && !declaredGws.has(gw)) issues.push({ kind: "missing_gameweek_row", severity: "blocking", gw });
  for (const [table, meta] of Object.entries(pagination || {})) {
    if (meta?.truncated || (Number.isInteger(meta?.expected_count) && meta.expected_count !== meta.rows_read)) {
      issues.push({ kind: "supabase_pagination_truncation", severity: "blocking", table, ...meta });
    }
  }
  const newest = projections.map((row) => Date.parse(row?.computed_at || "")).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (newest && Date.now() - newest > 24 * 60 * 60 * 1000) issues.push({ kind: "stale_generation", severity: "blocking", computed_at: new Date(newest).toISOString() });
  return {
    generated_at: new Date().toISOString(),
    issues,
    blocking: issues.filter((issue) => issue.severity === "blocking"),
    warnings: issues.filter((issue) => issue.severity !== "blocking"),
    malformed_fixtures: fixtureAudit.issues.filter((issue) => issue.kind.includes("fixture") || issue.kind.includes("team") || issue.kind === "invalid_gameweek"),
  };
}
