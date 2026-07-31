const integer = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const positiveId = (value) => {
  const number = integer(value);
  return number !== null && number > 0 ? number : null;
};

export const fixtureIdentity = (fixture) => positiveId(fixture?.fpl_id) ?? positiveId(fixture?.id);

export function normaliseFixtureRow(fixture = {}) {
  return {
    ...fixture,
    id: positiveId(fixture.id),
    fpl_id: positiveId(fixture.fpl_id),
    gw: integer(fixture.gw),
    home_team: positiveId(fixture.home_team),
    away_team: positiveId(fixture.away_team),
  };
}

export function isCurrentOrUpcomingFixture(fixture, {
  currentSeason = "2026-27",
  liveTeamIds = [],
} = {}) {
  if (fixture?.finished === true) return false;
  const live = liveTeamIds instanceof Set ? liveTeamIds : new Set([...liveTeamIds].map(Number));
  const season = String(fixture?.season || "");
  if (season === currentSeason) return true;
  return !season && live.has(Number(fixture?.home_team)) && live.has(Number(fixture?.away_team));
}

export function auditFixtureRows(fixtures = [], teams = [], options = {}) {
  const teamIds = new Set((teams || []).map((team) => positiveId(team?.id)).filter(Boolean));
  const liveTeamIds = options.liveTeamIds instanceof Set
    ? options.liveTeamIds
    : new Set((options.liveTeamIds || teams.filter((team) => team?.archive !== true).map((team) => team.id)).map(Number));
  const normalised = fixtures.map(normaliseFixtureRow);
  const issues = [];
  const byIdentity = new Map();

  for (const fixture of normalised) {
    const identity = fixtureIdentity(fixture);
    const current = isCurrentOrUpcomingFixture(fixture, { ...options, liveTeamIds });
    const historical = fixture.finished === true && !current;
    const severity = current ? "blocking" : "warning";
    const add = (kind, detail = {}) => issues.push({
      kind,
      severity,
      fixture_id: identity,
      season: fixture.season ?? null,
      finished: fixture.finished === true,
      ...detail,
    });

    if (identity === null) add("invalid_fixture_id");
    else {
      const group = byIdentity.get(identity) || [];
      group.push(fixture);
      byIdentity.set(identity, group);
    }
    if (fixture.home_team === null) add("invalid_home_team", { value: fixture.home_team });
    else if (teamIds.size && !teamIds.has(fixture.home_team)) add("missing_home_team", { value: fixture.home_team });
    if (fixture.away_team === null) add("invalid_away_team", { value: fixture.away_team });
    else if (teamIds.size && !teamIds.has(fixture.away_team)) add("missing_away_team", { value: fixture.away_team });
    if (fixture.gw === null || fixture.gw < 1 || fixture.gw > 38) add("invalid_gameweek", { value: fixture.gw });
    if (historical && (fixture.home_team === null || fixture.away_team === null || fixture.gw === null)) {
      add("malformed_finished_historical_fixture");
    }
  }

  for (const [identity, rows] of byIdentity) {
    if (rows.length > 1) issues.push({
      kind: "duplicate_fixture_id",
      severity: rows.some((row) => isCurrentOrUpcomingFixture(row, { ...options, liveTeamIds })) ? "blocking" : "warning",
      fixture_id: identity,
      count: rows.length,
    });
  }

  return {
    fixtures: normalised,
    issues,
    blocking: issues.filter((issue) => issue.severity === "blocking"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}

export function archiveFixtureUpsert(existing, candidate) {
  const next = normaliseFixtureRow(candidate);
  if (next.fpl_id === null) throw new Error("archive fixture repair requires a valid fpl_id");
  const current = existing ? normaliseFixtureRow(existing) : null;
  const fields = ["gw", "home_team", "away_team", "home_goals", "away_goals", "kickoff_utc", "finished", "season", "competition"];
  const row = { fpl_id: next.fpl_id };
  for (const field of fields) row[field] = next[field] ?? current?.[field] ?? null;
  const incomplete = !current || current.gw === null || current.home_team === null || current.away_team === null;
  return { action: current ? (incomplete ? "repair" : "refresh") : "insert", row };
}

export const __fixtureRowsTest = { integer, positiveId };
