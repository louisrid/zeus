/* THE PUBLISHED LINE-UPS: name resolution, and the minutes they imply.
 *
 * Two jobs, both of which were broken.
 *
 * 1. MATCHING. The first version searched only within the club the source lists. That fails whenever a
 *    player has moved and our player list has not caught up: Lacroix is published in Chelsea's eleven but
 *    sits at Crystal Palace in our data, so he read as "not in FPL". It also failed on names where the
 *    surname alone is not the FPL short name, such as Igor Jesus and Joao Pedro.
 *
 *    Matching is now league-wide and scored. Every candidate is scored on how well its tokens agree with
 *    the published name, with a bonus for being at the club the source says. The best candidate wins only
 *    if it clears a threshold and beats the runner-up, so a genuine ambiguity resolves to nothing rather
 *    than to a coin flip. A wrong player is worse than an unmatched one.
 *
 * 2. MINUTES. Before this, xPTS pre-season was meaningless: the minutes table is empty, startProbOf
 *    returned null, and every player scored zero. A published eleven is the strongest minutes evidence
 *    that exists, so it is used directly. A player in the eleven is treated as a near-certain starter; a
 *    player at a club WITH a published eleven who is not in it is treated as a substitute. Clubs with no
 *    published eleven fall back to whatever the minutes model has.
 */
import LINEUPS from "../config/lineups.json" with { type: "json" };

export const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (s) => norm(s).split(" ").filter(Boolean);

/* How well does a candidate player answer to this published name?
 *
 *   4  the published name IS the FPL short name
 *   3  the short name is the published surname
 *   2  every token of the short name appears in the published name
 *   1  the surnames agree
 *   +2 same club as the source says
 *
 * Anything below 3 after the club bonus is not a match. */
function score(publishedName, player, sameClub) {
  const pub = tokens(publishedName);
  if (!pub.length) return 0;
  const web = tokens(player.web_name);
  const full = tokens(player.name || "");
  const pubLast = pub[pub.length - 1];

  let base = 0;
  if (web.join(" ") === pub.join(" ")) base = 4;
  else if (full.join(" ") === pub.join(" ")) base = 4;
  else if (web.length === 1 && web[0] === pubLast) base = 3;
  else if (web.length && web.every((t) => pub.includes(t))) base = 2;
  else if (full.length && full[full.length - 1] === pubLast) base = 2;
  else if (web.length && web[web.length - 1] === pubLast) base = 1;

  // A published name with two tokens that both appear in the full name is a strong signal: this is what
  // separates Joao Pedro from Pedro Neto, and Igor Jesus from Gabriel Jesus.
  if (pub.length >= 2 && full.length >= 2 && pub.every((t) => full.includes(t))) base = Math.max(base, 4);
  if (base === 0) return 0;
  return base + (sameClub ? 2 : 0);
}

/* Resolve one published name against the whole league. `clubTeamId` is where the source says he plays. */
export function resolveName(publishedName, players, clubTeamId) {
  const scored = [];
  for (const p of players) {
    const s = score(publishedName, p, clubTeamId != null && p.team_id === clubTeamId);
    if (s > 0) scored.push({ p, s });
  }
  if (!scored.length) return null;
  /* Sort by score, then break ties on the club the source names. Two players called Fernandes score the
     same against "Fernandes"; the source saying Tottenham is what tells us which one. Still tied after
     that, and it refuses: a wrong player is worse than an unmatched one. */
  scored.sort((a, b) => (b.s - a.s)
    || ((clubTeamId != null && b.p.team_id === clubTeamId ? 1 : 0) - (clubTeamId != null && a.p.team_id === clubTeamId ? 1 : 0)));
  const best = scored[0];
  const runnerUp = scored[1];
  if (best.s < 3) return null;
  if (runnerUp && runnerUp.s === best.s) {
    const bestAtClub = clubTeamId != null && best.p.team_id === clubTeamId;
    const nextAtClub = clubTeamId != null && runnerUp.p.team_id === clubTeamId;
    if (bestAtClub === nextAtClub) return null;
  }
  return best.p;
}

export const CLUB_ALIASES = {
  "nottingham forest": "nott m forest",
  "nottm forest": "nott m forest",
  spurs: "tottenham",
  "man united": "man utd",
  "manchester united": "man utd",
  "manchester city": "man city",
};

export function clubOfRow(row, teams) {
  const byShort = teams.find((t) => t.short_name === row.short);
  if (byShort) return byShort;
  const n = norm(row.club);
  const alias = CLUB_ALIASES[n] || n;
  return teams.find((t) => norm(t.name) === alias || norm(t.short_name) === alias)
    || teams.find((t) => norm(t.name).startsWith(alias.split(" ")[0]) && alias.split(" ")[0].length >= 4)
    || null;
}

/* Every published eleven, resolved to our players.
 *
 * Returns:
 *   byClub        club short name -> { row, club, lines: [[{ name, player }]] }
 *   startingIds   Set of fpl_ids named in a published eleven
 *   clubsCovered  Set of team ids that have a published eleven
 *   unmatched     [{ club, name }] for anything that did not resolve, so it is visible rather than silent
 */
export function resolveLineups(players, teams) {
  const byClub = new Map();
  const startingIds = new Set();
  const clubsCovered = new Set();
  const unmatched = [];

  for (const row of LINEUPS.clubs) {
    const club = clubOfRow(row, teams);
    if (club) clubsCovered.add(club.id);
    const lines = row.rows.map((line) => line.map((name) => {
      // An explicit id in the file always wins: it is there because the name is ambiguous.
      const forced = row.ids && row.ids[name];
      const player = forced
        ? players.find((p) => p.fpl_id === forced) || null
        : resolveName(name, players, club ? club.id : null);
      if (player) startingIds.add(player.fpl_id);
      else unmatched.push({ club: row.club, name });
      return { name, player };
    }));
    byClub.set(row.short, { row, club, lines });
  }
  return { byClub, startingIds, clubsCovered, unmatched, source: LINEUPS.source, captured: LINEUPS.captured };
}

/* THE MINUTES A PUBLISHED ELEVEN IMPLIES.
 *
 * A named starter is treated as a near-certain start rather than a certainty, because team news moves and
 * the source itself is a prediction. 0.94 is high enough that xPTS reflects a starter properly and low
 * enough that it is not claiming to know the team sheet.
 *
 * A player at a club WITH a published eleven who is not named in it is a substitute: he is expected to
 * come on sometimes, not to start. That is what stops squad players carrying starter-level xPTS.
 */
export const LINEUP_MINUTES = {
  starter: { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 },
  notNamed: { p_start: 0.10, exp_min_start: 80, p_cameo: 0.34, exp_min_cameo: 20 },
};

/* Merge published elevens into whatever the minutes table holds.
 *
 * Published team news beats a forecast, so it overwrites. Clubs without a published eleven keep their
 * existing forecast, and players at those clubs are untouched. */
export function minutesWithLineups(existing, players, teams) {
  const { byClub, startingIds } = resolveLineups(players, teams);
  const out = new Map(existing || []);

  /* CONFIDENCE GUARD, per club.
   *
   * Treating a player as a substitute costs him roughly six sevenths of his xPTS, so it must only happen
   * where we are sure he is not in the eleven. If a club's names do not resolve, everyone there looks
   * unnamed and the whole club collapses to substitute numbers. That is exactly what Louis saw: Nottingham
   * Forest's entire side reading 0.7 to 2.1 instead of 3 to 5.
   *
   * So a club only gets substitute numbers applied when at least nine of its eleven resolved. Below that we
   * clearly have a naming problem at that club, and the honest thing is to leave its minutes alone and let
   * the existing forecast stand. A matching failure can no longer poison a club's projections.
   *
   * Named starters are raised regardless, because a match that succeeded is evidence either way. */
  const CONFIDENT_AT = 9;

  for (const { club, lines } of byClub.values()) {
    if (!club) continue;
    const matched = lines.flat().filter((x) => x.player).length;
    for (const x of lines.flat()) {
      if (x.player) out.set(x.player.fpl_id, { ...LINEUP_MINUTES.starter });
    }
    if (matched < CONFIDENT_AT) continue;
    for (const p of players) {
      if (p.team_id !== club.id || startingIds.has(p.fpl_id)) continue;
      out.set(p.fpl_id, { ...LINEUP_MINUTES.notNamed });
    }
  }
  return out;
}

/* How well each club's published eleven resolved, so the page can say so in plain words. */
export function matchReport(players, teams) {
  const { byClub } = resolveLineups(players, teams);
  return [...byClub.values()].map(({ row, club, lines }) => ({
    club: row.club,
    short: row.short,
    matched: lines.flat().filter((x) => x.player).length,
    total: lines.flat().length,
    missing: lines.flat().filter((x) => !x.player).map((x) => x.name),
    linked: Boolean(club),
  }));
}
