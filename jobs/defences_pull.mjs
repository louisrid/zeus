/* DEFENCES. Reads Sports Mole's Premier League best-defence tables (overall, home, away) and writes them
   to config/defences.json for the Defences page. Runs inside the update's check step. */
import { writeFileSync } from "fs";

const PAGE = "https://www.sportsmole.co.uk/football/premier-league/best-defence.html";
const OUT = new URL("../config/defences.json", import.meta.url);

/* Sports Mole's club names to the codes used across the site. */
const CODES = {
  "arsenal": "ARS", "aston villa": "AVL", "bournemouth": "BOU", "afc bournemouth": "BOU", "brentford": "BRE",
  "brighton & hove albion": "BHA", "brighton": "BHA", "chelsea": "CHE", "coventry city": "COV", "coventry": "COV",
  "crystal palace": "CRY", "everton": "EVE", "fulham": "FUL", "hull city": "HUL", "hull": "HUL",
  "ipswich town": "IPS", "ipswich": "IPS", "leeds united": "LEE", "leeds": "LEE", "liverpool": "LIV",
  "manchester city": "MCI", "man city": "MCI", "manchester united": "MUN", "man united": "MUN", "man utd": "MUN",
  "newcastle united": "NEW", "newcastle": "NEW", "nottingham forest": "NFO", "nott'm forest": "NFO",
  "tottenham hotspur": "TOT", "tottenham": "TOT", "spurs": "TOT", "sunderland": "SUN",
  "west ham united": "WHU", "wolverhampton wanderers": "WOL", "wolves": "WOL", "burnley": "BUR", "leicester city": "LEI",
  "southampton": "SOU", "sheffield united": "SHU", "luton town": "LUT", "norwich city": "NOR", "watford": "WAT",
  "middlesbrough": "MID", "west bromwich albion": "WBA", "stoke city": "STK", "swansea city": "SWA", "cardiff city": "CAR",
};

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function parseTables(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const parsed = [];
  for (const t of tables) {
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(strip));
    if (!rows.length) continue;
    const head = rows[0].map((h) => h.toLowerCase());
    if (!(head[0] === "pos" && head[1] === "team" && head.some((h) => h.startsWith("goals against")))) continue;
    const body = rows.slice(1).filter((r) => r.length >= 5 && /^\d+$/.test(r[0]));
    if (body.length < 10) continue;
    parsed.push(body.map((r) => ({
      team: r[1], code: CODES[r[1].toLowerCase()] || null,
      goals_against: Number(r[2]), avg_per_game: Number(r[3]), clean_sheets: Number(r[4]),
    })));
  }
  return parsed;
}

const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (FPLBot defences reader)" } });
if (!res.ok) throw new Error(`Sports Mole returned ${res.status}`);
const tables = parseTables(await res.text());

/* DEFENCE RATING. Raw goals conceded says nothing about who they were conceded against: one goal at
   Manchester City is not one goal at home to Hull. Each finished game is compared with what an average
   defence would concede to that opponent (the opponent's goals per game this season, scaled for venue),
   with the last three games counting double. adjusted = conceded / expected, so 1.0 is average, 0.5 is
   half the goals an average defence lets in, 1.5 is half as many again. rating = 50 + (1 - adjusted) x 100,
   clamped 0 to 100: 100 is elite, 0 is a sieve. Computed for all games, home only and away only. */
async function defenceRatings() {
  const headers = { "User-Agent": "Mozilla/5.0 (FPLBot defences reader)" };
  const [teams, fixtures] = await Promise.all([
    fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers }).then((r) => r.json()).then((j) => j.teams || []),
    fetch("https://fantasy.premierleague.com/api/fixtures/?future=0", { headers }).then((r) => r.json()),
  ]);
  const code = new Map(teams.map((t) => [t.id, t.short_name]));
  /* A match counts once its result is in: FPL marks it finished only after bonus is confirmed, often the
     next day, so a provisional finish counts too (otherwise Saturday's results were missing all weekend
     and the tables disagreed with Sports Mole). */
  const done = fixtures.filter((f) => (f.finished || f.finished_provisional) && f.kickoff_time
    && f.team_h_score !== null && f.team_a_score !== null)
    .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
  const scoredBy = {}; let totalGoals = 0, totalTeamGames = 0;
  for (const f of done) {
    const h = code.get(f.team_h), a = code.get(f.team_a);
    (scoredBy[h] = scoredBy[h] || []).push(Number(f.team_h_score) || 0);
    (scoredBy[a] = scoredBy[a] || []).push(Number(f.team_a_score) || 0);
    totalGoals += (Number(f.team_h_score) || 0) + (Number(f.team_a_score) || 0); totalTeamGames += 2;
  }
  const leagueAvg = totalTeamGames ? totalGoals / totalTeamGames : 1.4;
  const attack = (c) => (scoredBy[c] && scoredBy[c].length ? scoredBy[c].reduce((x, y) => x + y, 0) / scoredBy[c].length : leagueAvg);
  const games = {};
  for (const f of done) {
    const h = code.get(f.team_h), a = code.get(f.team_a);
    const hs = Number(f.team_h_score) || 0, as = Number(f.team_a_score) || 0;
    (games[h] = games[h] || []).push({ venue: "home", conceded: as, expected: attack(a) * 0.9, when: f.kickoff_time });
    (games[a] = games[a] || []).push({ venue: "away", conceded: hs, expected: attack(h) * 1.1, when: f.kickoff_time });
  }
  const rate = (list) => {
    if (!list.length) return null;
    const sorted = [...list].sort((x, y) => new Date(y.when) - new Date(x.when));
    let c = 0, e = 0;
    sorted.forEach((g, i) => { const w = i < 3 ? 2 : 1; c += g.conceded * w; e += g.expected * w; });
    const adjusted = e > 0 ? c / e : 1;
    return { adjusted: Math.round(adjusted * 100) / 100, rating: Math.max(0, Math.min(100, Math.round(50 + (1 - adjusted) * 100))) };
  };
  const out = {};
  for (const [c, list] of Object.entries(games)) {
    out[c] = { overall: rate(list), home: rate(list.filter((g) => g.venue === "home")), away: rate(list.filter((g) => g.venue === "away")) };
  }
  /* ATTACKS, the mirror image: goals scored per game, with a rating against the defences faced (what an
     average attack would score against that opponent, venue-adjusted, last three games double) and the
     mean scored over the last three. */
  const concededBy = {};
  for (const f of done) {
    const h = code.get(f.team_h), a = code.get(f.team_a);
    (concededBy[h] = concededBy[h] || []).push(Number(f.team_a_score) || 0);
    (concededBy[a] = concededBy[a] || []).push(Number(f.team_h_score) || 0);
  }
  const defence = (c) => (concededBy[c] && concededBy[c].length ? concededBy[c].reduce((x, y) => x + y, 0) / concededBy[c].length : leagueAvg);
  const attacks = {};
  for (const f of done) {
    const h = code.get(f.team_h), a = code.get(f.team_a);
    const hs = Number(f.team_h_score) || 0, as = Number(f.team_a_score) || 0;
    (attacks[h] = attacks[h] || []).push({ venue: "home", scored: hs, expected: defence(a) * 1.1, when: f.kickoff_time });
    (attacks[a] = attacks[a] || []).push({ venue: "away", scored: as, expected: defence(h) * 0.9, when: f.kickoff_time });
  }
  const attackRow = (list) => {
    if (!list.length) return null;
    const sorted = [...list].sort((x, y) => new Date(y.when) - new Date(x.when));
    let sc = 0, ex = 0; sorted.forEach((g, i) => { const w = i < 3 ? 2 : 1; sc += g.scored * w; ex += g.expected * w; });
    const adjusted = ex > 0 ? sc / ex : 1;
    const goals = list.reduce((t, g) => t + g.scored, 0);
    const last3 = sorted.slice(0, 3);
    return { games: list.length, goals, per_game: Math.round((goals / list.length) * 100) / 100,
      form_last3: Math.round((last3.reduce((t, g) => t + g.scored, 0) / last3.length) * 100) / 100,
      adjusted: Math.round(adjusted * 100) / 100, rating: Math.max(0, Math.min(100, Math.round(50 + (adjusted - 1) * 100))) };
  };
  const attackTables = { overall: [], home: [], away: [] };
  for (const [c, list] of Object.entries(attacks)) {
    const team = teams.find((t) => t.short_name === c);
    for (const [name, filter] of [["overall", () => true], ["home", (g) => g.venue === "home"], ["away", (g) => g.venue === "away"]]) {
      const row = attackRow(list.filter(filter));
      if (row) attackTables[name].push({ team: team ? team.name : c, code: c, ...row });
    }
  }
  out.__attack = attackTables;
  /* EVERY PLAYED MATCH, so the Attacks and Defences pages can build their tables over any range of
     gameweeks you choose (lib/club-results.mjs), not only the whole season. */
  out.__matches = done.map((f) => ({
    gw: Number(f.event), home: code.get(f.team_h), away: code.get(f.team_a),
    hs: Number(f.team_h_score) || 0, as: Number(f.team_a_score) || 0, kickoff: f.kickoff_time,
  })).filter((m) => Number.isInteger(m.gw) && m.home && m.away);
  out.__teams = Object.fromEntries(teams.map((t) => [t.short_name, t.name]));
  return out;
}
let ratings = {};
try { ratings = await defenceRatings(); } catch (e) { console.log(`Ratings could not be computed: ${e.message}`); }
for (const [name, rows] of [["overall", tables[0] || []], ["home", tables[1] || []], ["away", tables[2] || []]]) {
  for (const r of rows) {
    const rt = r.code && ratings[r.code] ? ratings[r.code][name] : null;
    r.rating = rt ? rt.rating : null; r.adjusted = rt ? rt.adjusted : null;
  }
}
if (tables.length < 1) throw new Error("No defence table found on the page.");
const [overall, home = [], away = []] = tables;
const unmatched = overall.filter((r) => !r.code).map((r) => r.team);
const attack = ratings.__attack || { overall: [], home: [], away: [] }; delete ratings.__attack;
const matches = ratings.__matches || []; delete ratings.__matches;
const teamNames = ratings.__teams || {}; delete ratings.__teams;
const data = {
  source: "Sports Mole", source_url: PAGE, captured: new Date().toISOString(),
  attack,
  matches, team_names: teamNames,
  note: "Rows as Sports Mole lists them: best defence first. The site shows them reversed, worst first. rating (0-100, 50 = average) is goals conceded against what an average defence would concede to the same opponents, venue-adjusted, last three games weighted double (FPL fixtures feed). adjusted is the underlying ratio.",
  overall, home, away,
};
writeFileSync(OUT, JSON.stringify(data, null, 1));
console.log(`Defences: ${overall.length} clubs (home ${home.length}, away ${away.length})${unmatched.length ? `; unmatched: ${unmatched.join(", ")}` : ""}`);
