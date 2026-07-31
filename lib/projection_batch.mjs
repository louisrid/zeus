const integer = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const unique = (values) => [...new Set(values)];

export function projectionFixtureKey(fixture, index = 0) {
  const id = integer(fixture?.id ?? fixture?.fpl_id);
  if (id !== null) return `id:${id}`;
  return `gw:${integer(fixture?.gw) ?? "?"}:home:${integer(fixture?.home_team) ?? "?"}:away:${integer(fixture?.away_team) ?? "?"}:row:${index}`;
}

export function projectionBatchReport({
  targetGws = [],
  fixtures = [],
  projectionRows = [],
  profiles = [],
  simulatedFixtureKeys = [],
  expectedPlayersPerGameweek = null,
} = {}) {
  const targets = unique(targetGws.map(integer).filter((gw) => gw !== null)).sort((a, b) => a - b);
  const simulated = simulatedFixtureKeys instanceof Set
    ? simulatedFixtureKeys
    : new Set(simulatedFixtureKeys || []);
  const profileRows = (profiles || [])
    .map((profile) => ({ playerId: integer(profile?.player_id ?? profile?.id), teamId: integer(profile?.team_id) }))
    .filter((profile) => profile.playerId !== null && profile.teamId !== null);
  const expectedPlayerTotal = integer(expectedPlayersPerGameweek);
  const failures = [];
  const gameweeks = [];

  for (const gw of targets) {
    const fixturesForGw = (fixtures || []).filter((fixture) => integer(fixture?.gw) === gw);
    const fixtureKeys = fixturesForGw.map(projectionFixtureKey);
    const simulatedCount = fixtureKeys.filter((key) => simulated.has(key)).length;
    const teamCounts = new Map();
    const teamIds = new Set();
    for (const fixture of fixturesForGw) {
      for (const teamId of [integer(fixture?.home_team), integer(fixture?.away_team)]) {
        if (teamId === null) continue;
        teamIds.add(teamId);
        teamCounts.set(teamId, (teamCounts.get(teamId) || 0) + 1);
      }
    }

    const doubleTeams = [...teamCounts].filter(([, count]) => count > 1).map(([teamId]) => teamId);
    const expectedPlayerIds = new Set(profileRows.filter((profile) => teamIds.has(profile.teamId)).map((profile) => profile.playerId));
    const rowsForGw = (projectionRows || []).filter((row) => integer(row?.gw) === gw);
    const actualPlayerIds = new Set(rowsForGw.map((row) => integer(row?.player_id)).filter((id) => id !== null));
    const missingPlayerIds = [...expectedPlayerIds].filter((id) => !actualPlayerIds.has(id));
    const unexpectedPlayerIds = [...actualPlayerIds].filter((id) => !expectedPlayerIds.has(id));
    const duplicatePlayerRows = rowsForGw.length - actualPlayerIds.size;

    const summary = {
      gw,
      selected_fixtures: fixturesForGw.length,
      simulated_fixtures: simulatedCount,
      participating_teams: teamIds.size,
      expected_players: expectedPlayerIds.size,
      projection_rows: rowsForGw.length,
      unique_projected_players: actualPlayerIds.size,
      missing_player_ids: missingPlayerIds,
      unexpected_player_ids: unexpectedPlayerIds,
      duplicate_player_rows: duplicatePlayerRows,
      double_fixture_team_ids: doubleTeams,
    };
    gameweeks.push(summary);

    if (!fixturesForGw.length) failures.push({ gw, kind: "no_fixtures" });
    if (expectedPlayerTotal !== null && expectedPlayerIds.size !== expectedPlayerTotal) failures.push({
      gw,
      kind: "fixture_team_coverage_incomplete",
      expected_players: expectedPlayerTotal,
      participating_players: expectedPlayerIds.size,
      participating_teams: teamIds.size,
    });
    if (simulatedCount !== fixturesForGw.length) failures.push({
      gw, kind: "fixture_simulation_incomplete", expected: fixturesForGw.length, actual: simulatedCount,
    });
    if (doubleTeams.length) failures.push({ gw, kind: "double_gameweek_requires_aggregation", team_ids: doubleTeams });
    if (missingPlayerIds.length) failures.push({
      gw, kind: "missing_projection_rows", count: missingPlayerIds.length, player_ids: missingPlayerIds.slice(0, 25),
    });
    if (unexpectedPlayerIds.length) failures.push({
      gw, kind: "unexpected_projection_rows", count: unexpectedPlayerIds.length, player_ids: unexpectedPlayerIds.slice(0, 25),
    });
    if (!doubleTeams.length && duplicatePlayerRows) failures.push({
      gw, kind: "duplicate_projection_rows", count: duplicatePlayerRows,
    });
  }

  const report = {
    pass: failures.length === 0 && gameweeks.length === targets.length,
    generated_at: new Date().toISOString(),
    target_gameweeks: targets,
    expected_players_per_gameweek: expectedPlayerTotal,
    gameweeks,
    failures,
  };
  return report;
}

export function assertProjectionBatchComplete(input = {}) {
  const report = projectionBatchReport(input);
  if (!report.pass) {
    const preview = report.failures.slice(0, 8).map((failure) => {
      const gw = failure.gw ? `GW${failure.gw}` : "projection";
      return `${gw} ${failure.kind}`;
    }).join("; ");
    const error = new Error(`Projection horizon is incomplete: ${preview}`);
    error.report = report;
    throw error;
  }
  return report;
}


/**
 * Build deterministic Supabase upsert batches without ever mixing gameweeks.
 *
 * The old generic 500-row chunks split a 564-player gameweek across requests and could also put the
 * beginning of the next gameweek in the same request. A cancellation or transient failure could therefore
 * expose a partial gameweek. These batches write the furthest future gameweek first and the current one last,
 * with each normal gameweek sent in one atomic PostgREST statement.
 */
export function projectionWriteBatches(rows = [], targetGws = [], maxBatchSize = 750) {
  const limit = Math.max(1, integer(maxBatchSize) ?? 750);
  const requested = unique(targetGws.map(integer).filter((gw) => gw !== null));
  const requestedSet = new Set(requested);
  const byGw = new Map();

  for (const row of rows || []) {
    const gw = integer(row?.gw);
    if (gw === null) throw new Error(`projection write row has invalid gameweek: ${row?.gw}`);
    if (requestedSet.size && !requestedSet.has(gw)) {
      throw new Error(`projection write row targets unexpected GW${gw}`);
    }
    const group = byGw.get(gw) || [];
    group.push(row);
    byGw.set(gw, group);
  }

  const order = (requested.length ? requested : [...byGw.keys()])
    .slice()
    .sort((a, b) => b - a);
  const batches = [];
  for (const gw of order) {
    const group = (byGw.get(gw) || []).slice().sort((a, b) => {
      const left = integer(a?.player_id) ?? Number.MAX_SAFE_INTEGER;
      const right = integer(b?.player_id) ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });
    for (let index = 0; index < group.length; index += limit) {
      batches.push({ gw, rows: group.slice(index, index + limit) });
    }
  }
  return batches;
}
