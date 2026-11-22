/* CLUB RESULTS OVER ANY GAMEWEEKS.
 *
 * The Attacks and Defences pages used to show season totals only. Every played match is now stored with
 * the data update (config/defences.json, `matches`), so both tables are built here for whatever range of
 * gameweeks is picked, home, away or all.
 *
 * Defence: games, goals conceded, conceded per game, clean sheets.
 * Attack:  games, goals, goals per game, form (mean over the last three games in the range), and the
 *          goals an average attack would have scored against the same opponents, with the difference. An
 *          opponent's strength is its whole-season record, so a short range is judged against stable
 *          defences. */

export function playedGameweeks(matches = []) {
  const gws = matches.map((m) => Number(m.gw)).filter(Number.isInteger);
  return gws.length ? { first: Math.min(...gws), last: Math.max(...gws) } : null;
}

/* Each club's matches as its own rows: for, against, venue, opponent. */
function clubGames(matches, { from, to, venue = "overall" }) {
  const byClub = new Map();
  const add = (club, row) => { if (!byClub.has(club)) byClub.set(club, []); byClub.get(club).push(row); };
  for (const m of matches) {
    const gw = Number(m.gw);
    if (!Number.isInteger(gw) || gw < from || gw > to) continue;
    if (venue !== "away") add(m.home, { gw, venue: "home", scored: m.hs, conceded: m.as, opponent: m.away, kickoff: m.kickoff });
    if (venue !== "home") add(m.away, { gw, venue: "away", scored: m.as, conceded: m.hs, opponent: m.home, kickoff: m.kickoff });
  }
  for (const list of byClub.values()) list.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return byClub;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function defenceTable(matches = [], { from, to, venue = "overall", names = {} } = {}) {
  const rows = [];
  for (const [code, games] of clubGames(matches, { from, to, venue })) {
    const conceded = games.reduce((t, g) => t + g.conceded, 0);
    rows.push({
      team: names[code] || code, code, games: games.length,
      goals_against: conceded,
      avg_per_game: games.length ? round2(conceded / games.length) : 0,
      clean_sheets: games.filter((g) => g.conceded === 0).length,
    });
  }
  return rows;
}

export function attackTable(matches = [], { from, to, venue = "overall", names = {} } = {}) {
  /* What every club concedes per game over the whole season: the yardstick for "an average attack". */
  const season = playedGameweeks(matches) || { first: 1, last: 1 };
  const allGames = clubGames(matches, { from: season.first, to: season.last });
  let goals = 0, teamGames = 0;
  for (const list of allGames.values()) for (const g of list) { goals += g.scored; teamGames += 1; }
  const leagueAvg = teamGames ? goals / teamGames : 1.4;
  const concedes = new Map([...allGames].map(([code, list]) => [code, list.length ? list.reduce((t, g) => t + g.conceded, 0) / list.length : leagueAvg]));

  const rows = [];
  for (const [code, games] of clubGames(matches, { from, to, venue })) {
    if (!games.length) continue;
    const scored = games.reduce((t, g) => t + g.scored, 0);
    const last3 = [...games].reverse().slice(0, 3);
    /* VERSUS AVERAGE, ONE IDEA. Each opponent normally lets in so many a game; added up over the games in
       the range, that is what an average attack would have scored against the same defences. The club's
       goals minus that is the comparison: +2.4 means two and a bit more than an average attack managed
       against the same opposition. Goals = average + difference, so the three numbers always add up. */
    const average = games.reduce((t, g) => t + (concedes.get(g.opponent) ?? leagueAvg), 0);
    rows.push({
      team: names[code] || code, code, games: games.length,
      goals: scored,
      per_game: round2(scored / games.length),
      form_last3: round2(last3.reduce((t, g) => t + g.scored, 0) / last3.length),
      average: Math.round(average * 10) / 10,
      vs_average: Math.round((scored - average) * 10) / 10,
    });
  }
  return rows;
}
