import { finiteNumber, parseList } from "./player-query.mjs";

const text = (value) => String(value ?? "").trim();

const readParam = (input, key) => {
  if (!input) return undefined;
  if (typeof input.get === "function") return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
};

const readInteger = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
};

export function parseFixtureQueryParams(input = {}) {
  const gwFrom = readInteger(readParam(input, "gw_from") ?? readParam(input, "gwFrom"), 1);
  const gwTo = readInteger(readParam(input, "gw_to") ?? readParam(input, "gwTo"), 38);
  if (!Number.isInteger(gwFrom) || !Number.isInteger(gwTo) || gwFrom < 1 || gwTo > 38 || gwFrom > gwTo) {
    throw new RangeError("Require 1 <= gw_from <= gw_to <= 38");
  }
  return {
    gwFrom,
    gwTo,
    clubs: parseList(readParam(input, "clubs") ?? readParam(input, "club")).map((value) => value.toUpperCase()),
  };
}

export function buildFixtureQueryResult({ fixtureRows = [], teamRows = [] } = {}, rawParams = {}) {
  const params = rawParams.gwFrom ? rawParams : parseFixtureQueryParams(rawParams);
  const teamById = new Map(teamRows.map((team) => [Number(team.id), team]));
  const codeOf = (id) => {
    const team = teamById.get(Number(id)) || {};
    return text(team.short_name || team.code || team.name) || String(id);
  };
  const nameOf = (id) => {
    const team = teamById.get(Number(id)) || {};
    return text(team.name || team.short_name || team.code) || String(id);
  };

  const allClubCodes = teamRows
    .map((team) => text(team.short_name || team.code || team.name).toUpperCase())
    .filter(Boolean)
    .sort();
  const selectedClubs = params.clubs.length ? params.clubs : allClubCodes;
  const selectedSet = new Set(selectedClubs);

  const inRange = fixtureRows
    .filter((fixture) => {
      const gw = finiteNumber(fixture?.gw);
      return Number.isInteger(gw) && gw >= params.gwFrom && gw <= params.gwTo;
    })
    .map((fixture) => ({
      fixture_id: finiteNumber(fixture.id),
      fpl_fixture_id: finiteNumber(fixture.fpl_id),
      gw: finiteNumber(fixture.gw),
      kickoff_utc: fixture.kickoff_utc ?? null,
      home_team_id: finiteNumber(fixture.home_team),
      away_team_id: finiteNumber(fixture.away_team),
      home_club: codeOf(fixture.home_team),
      away_club: codeOf(fixture.away_team),
      home_name: nameOf(fixture.home_team),
      away_name: nameOf(fixture.away_team),
      finished: Boolean(fixture.finished),
      home_goals: finiteNumber(fixture.home_goals),
      away_goals: finiteNumber(fixture.away_goals),
      season: fixture.season ?? null,
      competition: fixture.competition ?? null,
    }))
    .sort((a, b) => a.gw - b.gw
      || String(a.kickoff_utc || "").localeCompare(String(b.kickoff_utc || ""))
      || (a.fixture_id ?? Number.MAX_SAFE_INTEGER) - (b.fixture_id ?? Number.MAX_SAFE_INTEGER));

  const counts = new Map();
  for (const club of allClubCodes) {
    for (let gw = params.gwFrom; gw <= params.gwTo; gw += 1) counts.set(`${club}:${gw}`, 0);
  }
  for (const fixture of inRange) {
    counts.set(`${fixture.home_club.toUpperCase()}:${fixture.gw}`, (counts.get(`${fixture.home_club.toUpperCase()}:${fixture.gw}`) || 0) + 1);
    counts.set(`${fixture.away_club.toUpperCase()}:${fixture.gw}`, (counts.get(`${fixture.away_club.toUpperCase()}:${fixture.gw}`) || 0) + 1);
  }

  const flags = [];
  for (const club of selectedClubs) {
    for (let gw = params.gwFrom; gw <= params.gwTo; gw += 1) {
      const fixtureCount = counts.get(`${club}:${gw}`) || 0;
      flags.push({
        club,
        gw,
        fixture_count: fixtureCount,
        blank: fixtureCount === 0,
        double: fixtureCount > 1,
      });
    }
  }

  const fixtures = inRange
    .filter((fixture) => !params.clubs.length
      || selectedSet.has(fixture.home_club.toUpperCase())
      || selectedSet.has(fixture.away_club.toUpperCase()))
    .map((fixture) => ({
      ...fixture,
      home_double: (counts.get(`${fixture.home_club.toUpperCase()}:${fixture.gw}`) || 0) > 1,
      away_double: (counts.get(`${fixture.away_club.toUpperCase()}:${fixture.gw}`) || 0) > 1,
    }));

  return {
    ok: true,
    season: "2026-27",
    competition: "PL",
    gw_from: params.gwFrom,
    gw_to: params.gwTo,
    clubs: selectedClubs,
    matched_count: fixtures.length,
    returned_count: fixtures.length,
    complete: true,
    truncated: false,
    fixtures,
    club_gameweeks: flags,
  };
}

