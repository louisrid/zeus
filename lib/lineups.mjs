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
 *    player named in a validated GW1 predicted XI receives 100% predicted start probability. Expected
 *    minutes when starting remain player-specific. A player outside a validated XI has zero start probability
 *    but may retain a measured substitute chance. Clubs without a valid XI keep the forecast for open slots.
 */
/* Letters NFD cannot decompose, because they are distinct characters rather than a letter plus an accent.
   Without these, Odegaard never matched "Ødegaard", Gross never matched "Groß" and Kadioglu never matched
   "Kadıoğlu": the odd character was simply deleted, leaving "degaard", "gro" and "kadoglu". */
const LETTERS = { "ø": "o", "ß": "ss", "ı": "i", "ğ": "g", "đ": "d", "ð": "d", "ł": "l", "æ": "ae",
  "œ": "oe", "þ": "th", "ħ": "h", "ŋ": "n", "ſ": "s" };

export const norm = (s) => (s || "").toLowerCase()
  .replace(/[øßığđðłæœþħŋſ]/g, (c) => LETTERS[c] || c)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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

  /* Scores, highest wins. The FPL short name is the strongest signal, because it is what the game calls
     him and what the source is copying. A word buried in the full name is the weakest, because plenty of
     players share one: three Chelsea and United players contain "Pedro" or "Santos" somewhere. */
  let base = 0;
  if (web.join(" ") === pub.join(" ")) base = 5;                      // the short name IS the published name
  else if (full.join(" ") === pub.join(" ")) base = 5;                // or the full name is
  else if (web.length === 1 && web[0] === pubLast) base = 4;          // short name is the published surname
  else if (pub.length >= 2 && full.length >= 2 && pub.every((t) => full.includes(t))) base = 4;
  else if (web.length && web[web.length - 1] === pubLast) base = 3.5; // short name ENDS with it: Joao Pedro
  else if (web.length && web.every((t) => pub.includes(t))) base = 3;
  else if (full.length && full[full.length - 1] === pubLast) base = 3;
  // Weakest: a single published word appearing anywhere in the full name. This is what finds Alisson in
  // "Alisson Becker", and it must never outrank a genuine short-name match.
  else if (pub.length === 1 && full.includes(pub[0]) && pub[0].length > 3) base = 2.5;

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
  if (best.s < 2.5) return null;
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
export function resolveLineups(clubs, players, teams) {
  const byClub = new Map();
  const startingIds = new Set();
  const clubsCovered = new Set();
  const unmatched = [];
  const occurrences = new Map();

  for (const row of clubs || []) {
    const club = clubOfRow(row, teams);
    if (club) clubsCovered.add(club.id);
    const lines = row.rows.map((line) => line.map((name) => {
      const forced = row.ids && row.ids[name];
      const player = forced
        ? players.find((p) => p.fpl_id === forced) || null
        : resolveName(name, players, club ? club.id : null);
      const entry = { name, player, duplicateAcrossClubs: false };
      if (!player) unmatched.push({ club: row.club, name, reason: "unmatched" });
      else {
        if (!occurrences.has(player.fpl_id)) occurrences.set(player.fpl_id, []);
        occurrences.get(player.fpl_id).push({ entry, club, row });
      }
      return entry;
    }));
    byClub.set(row.short, { row, club, lines, valid: false, problems: [] });
  }

  /* A player named for a new club can still carry his old team_id before the upstream player list catches
     up. One predicted-XI occurrence therefore supplies a temporary engine team override. A real player
     appearing in two different XIs is never accepted twice: prefer the occurrence matching his stored club
     and reject the other one; otherwise reject every ambiguous occurrence. */
  for (const [fplId, hits] of occurrences) {
    if (hits.length <= 1) continue;
    const currentClubHits = hits.filter((hit) => hit.club && hit.entry.player?.team_id === hit.club.id);
    const keep = currentClubHits.length === 1 ? currentClubHits[0] : null;
    for (const hit of hits) {
      if (hit === keep) continue;
      hit.entry.duplicateAcrossClubs = true;
      unmatched.push({ club: hit.row.club, name: hit.entry.name, reason: `duplicate-player-${fplId}` });
      hit.entry.player = null;
    }
  }

  const teamOverrideByFplId = new Map();
  for (const value of byClub.values()) {
    const { club, lines } = value;
    const flat = lines.flat();
    const matched = flat.filter((x) => x.player);
    const ids = matched.map((x) => x.player.fpl_id);
    const goalkeepers = matched.filter((x) => String(x.player.position || "").toUpperCase() === "GKP");
    const problems = [];
    if (!club) problems.push("club-unmatched");
    if (flat.length !== 11) problems.push(`slots-${flat.length}`);
    if (matched.length !== 11) problems.push(`matched-${matched.length}`);
    if (new Set(ids).size !== matched.length) problems.push("duplicate-within-club");
    if (goalkeepers.length !== 1) problems.push(`goalkeepers-${goalkeepers.length}`);
    value.problems = problems;
    value.valid = problems.length === 0;

    for (const x of matched) {
      startingIds.add(x.player.fpl_id);
      if (club && x.player.team_id !== club.id) teamOverrideByFplId.set(x.player.fpl_id, club.id);
    }
  }

  return { byClub, startingIds, clubsCovered, unmatched, teamOverrideByFplId };
}

/* THE MINUTES A PUBLISHED ELEVEN IMPLIES.
 *
 * Start certainty and time on the pitch are separate. For the configured GW1 snapshot, a named player is
 * predicted to start with certainty, while his own substitution history still determines expected minutes
 * if starting. Outside a fully validated XI means zero predicted start probability, but substitute usage
 * remains player-specific and is reconciled to the real team-minute total.
 */
export const LINEUP_MINUTES = {
  // The named player starts; his own expected minutes if starting are preserved separately.
  starter: { p_start: 1, p_cameo: 0 },
  // Outside a fully validated XI means zero start probability. Substitute probability stays player-specific.
  notNamed: { p_start: 0 },
};

/* Merge published elevens into whatever the minutes table holds.
 *
 * Published team news beats a forecast, so it overwrites. Clubs without a published eleven keep their
 * existing forecast, and players at those clubs are untouched. */
export function minutesWithLineups(clubs, existing, players, teams) {
  const out = new Map(existing || []);
  const resolved = resolveLineups(clubs, players, teams);
  for (const { club, lines, valid } of resolved.byClub.values()) {
    if (!club) continue;
    for (const x of lines.flat()) if (x.player) out.set(x.player.fpl_id, { ...LINEUP_MINUTES.starter });
    if (!valid) continue;
    for (const p of players) {
      const effectiveTeam = resolved.teamOverrideByFplId.get(p.fpl_id) ?? p.team_id;
      if (effectiveTeam !== club.id || resolved.startingIds.has(p.fpl_id)) continue;
      out.set(p.fpl_id, { ...LINEUP_MINUTES.notNamed });
    }
  }
  return out;
}

/* How well each club's published eleven resolved, so the page can say so in plain words. */
export function matchReport(clubs, players, teams) {
  const { byClub } = resolveLineups(clubs, players, teams);
  return [...byClub.values()].map(({ row, club, lines, valid, problems }) => ({
    club: row.club,
    short: row.short,
    matched: lines.flat().filter((x) => x.player).length,
    total: lines.flat().length,
    missing: lines.flat().filter((x) => !x.player).map((x) => x.name),
    linked: Boolean(club),
    valid,
    problems,
  }));
}
