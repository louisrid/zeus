const finiteInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

export function normaliseProjectionHorizon(value, minimum = 8) {
  const floor = Math.max(1, finiteInteger(minimum) ?? 8);
  const requested = finiteInteger(value);
  return requested === null ? floor : Math.max(floor, requested);
}

export function selectProjectionHorizon({
  allFixtures = [],
  gameweeks = [],
  liveTeamIds = [],
  horizon = 8,
  season = "2026-27",
  competition = "PL",
} = {}) {
  const required = normaliseProjectionHorizon(horizon, 8);
  const liveIds = liveTeamIds instanceof Set
    ? liveTeamIds
    : new Set([...liveTeamIds].map((value) => Number(value)).filter(Number.isFinite));
  const expectedCompetition = String(competition).toUpperCase();

  const currentFixtures = allFixtures.filter((fixture) => {
    const gw = finiteInteger(fixture?.gw);
    if (gw === null || fixture?.finished === true) return false;

    const fixtureSeason = String(fixture?.season || "");
    const fixtureCompetition = String(fixture?.competition || expectedCompetition).toUpperCase();
    const home = Number(fixture?.home_team);
    const away = Number(fixture?.away_team);
    const currentLegacyRow = !fixtureSeason && liveIds.has(home) && liveIds.has(away);

    return fixtureCompetition === expectedCompetition
      && (fixtureSeason === season || currentLegacyRow);
  });

  const fixtureGameweeks = [...new Set(currentFixtures.map((fixture) => finiteInteger(fixture.gw)))]
    .filter((gw) => gw !== null)
    .sort((a, b) => a - b);
  const unfinishedGameweeks = gameweeks
    .filter((gameweek) => gameweek?.finished !== true)
    .map((gameweek) => finiteInteger(gameweek?.gw))
    .filter((gw) => gw !== null)
    .sort((a, b) => a - b);
  const targetGws = [...new Set([...unfinishedGameweeks, ...fixtureGameweeks])]
    .sort((a, b) => a - b)
    .slice(0, required);

  if (targetGws.length < required) {
    throw new Error(
      `projection horizon incomplete: found ${targetGws.length} upcoming gameweek(s), need ${required}. `
      + "Run fpl_bootstrap and confirm the FPL fixtures table contains the full season.",
    );
  }

  const selectedFixtures = currentFixtures.filter((fixture) => targetGws.includes(finiteInteger(fixture.gw)));
  const coveredGameweeks = new Set(selectedFixtures.map((fixture) => finiteInteger(fixture.gw)));
  const missingFixtureGameweeks = targetGws.filter((gw) => !coveredGameweeks.has(gw));
  if (missingFixtureGameweeks.length) {
    throw new Error(`projection fixtures missing for GW${missingFixtureGameweeks.join(", GW")}`);
  }

  return {
    required,
    targetGws,
    fixtures: selectedFixtures,
    currentFixtures,
    fixtureGameweeks,
  };
}
