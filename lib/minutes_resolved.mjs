/* ONE RESOLVED SET OF MINUTES, USED BY THE ENGINE AND BY THE SCREEN.
 *
 * WHY THIS FILE EXISTS. Osula, GW1 2026-27. The engine simulated him at a 28.6% chance of starting and
 * stored ep_mean 1.584. The display layer then read config/lineups.json, saw him named in Newcastle's
 * eleven, overrode his minutes to a guaranteed start, decided the engine's 1.584 was therefore
 * "impossibly low", threw the engine row away and replaced it with his last-season rate of 8.497 points
 * per 90. He appeared at 5.3, third-highest forward in the game, off 805 minutes and seven goals.
 *
 * Every part of that failure came from the same root: the engine and the screen resolved minutes
 * SEPARATELY, from different inputs, at different times. One of them then had to reconcile the
 * disagreement, and it did so by discarding the simulation.
 *
 * So minutes are resolved HERE, once, by a pure function. The projection job calls it before simulating.
 * The app calls it with the same inputs and gets the same answer, which means there is nothing left to
 * reconcile: p_start, p_cameo, p60, expected starting minutes and expected cameo minutes are identical on
 * both sides by construction, not by discipline.
 *
 * PRECEDENCE, highest first:
 *   1. Hard unavailability (injured, suspended, unavailable, not in squad) forces zero. Nothing overrides
 *      being unable to play.
 *   2. A published or predicted eleven. Naming is the strongest minutes evidence that exists.
 *   3. A press or team-news signal, which reaches the base forecast through forecastMinutes.
 *   4. The base minutes forecast.
 *
 * Availability is NOT applied twice. forecastMinutes already scales its output by availability, so the
 * forecast path is used as it arrives. The lineup path replaces the forecast wholesale and therefore
 * carries its own hard-unavailability check.
 */
import { LINEUP_MINUTES } from "./lineups.mjs";
export const MINUTES_RESOLVER_VERSION = "resolved-3";

const OUT_STATUSES = new Set(["i", "s", "u", "n"]);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* Can this player take the pitch at all? Only a hard no is expressed here. A doubt is left to the base
   forecast, which already carries it, so a 50% doubt is not halved twice. */
export function hardUnavailable(status) {
  return OUT_STATUSES.has(String(status || "").toLowerCase());
}
/* The single source of truth for a player's minutes in one gameweek.
 *
 *   base    the minutes forecast: either freshly computed by forecastMinutes or the stored row
 *   lineup  "starter" | "notNamed" | null, from the resolved predicted elevens
 *   status  the FPL availability letter, live
 *
 * Returns a complete minutes object plus the route that produced it, so the route can be persisted and
 * shown rather than inferred later from the size of the answer. */
export function resolveMinutes({ base, lineup, status, earlySubShare = 0, confidence = 1, official = false }) {
  const b = base || {};
  const position = b.position ?? null;
  const isGoalkeeper = String(position || "").toUpperCase() === "GKP";
  const p60GivenStart = num(b.p60_given_start, 0);
  const c = official ? 1 : Math.max(0, Math.min(1, num(confidence, 1)));

  if (hardUnavailable(status)) {
    return {
      position,
      p_start: 0, p_cameo: 0, p60: 0, p60_given_start: p60GivenStart,
      exp_min_start: num(b.exp_min_start), exp_min_cameo: num(b.exp_min_cameo),
      wc_load_flag: Boolean(b.wc_load_flag),
      minutes_source: "unavailable",
    };
  }

  /* The validated GW1 XI is the model's selection assumption. Start probability is one, while expected
     time on the pitch still comes from the player's own substitution history. */
  if (lineup === "starter") {
    const expMinStart = Number.isFinite(Number(b.exp_min_start))
      ? Math.max(0, Math.min(90, Number(b.exp_min_start)))
      : 90;
    return {
      position,
      p_start: 1,
      p_cameo: 0,
      p60: p60GivenStart,
      p60_given_start: p60GivenStart,
      exp_min_start: expMinStart,
      exp_min_cameo: num(b.exp_min_cameo),
      wc_load_flag: Boolean(b.wc_load_flag),
      minutes_source: "lineup-starter",
      lineup_confidence: c,
      lineup_official: Boolean(official),
    };
  }

  /* Outside a complete validated XI means no start. The base model's measured cameo probability remains,
     then the team reconciliation scales all bench players into the available substitute-minute budget. */
  if (lineup === "notNamed") {
    const pCameo = isGoalkeeper ? 0 : Math.max(0, Math.min(1, num(b.p_cameo)));
    return {
      position,
      p_start: 0,
      p_cameo: pCameo,
      p60: pCameo * num(earlySubShare),
      p60_given_start: p60GivenStart,
      exp_min_start: num(b.exp_min_start),
      exp_min_cameo: num(b.exp_min_cameo),
      wc_load_flag: Boolean(b.wc_load_flag),
      minutes_source: "lineup-notNamed",
      lineup_confidence: c,
      lineup_official: Boolean(official),
    };
  }

  const pStart = num(b.p_start);
  const pCameo = isGoalkeeper ? 0 : num(b.p_cameo);
  return {
    position,
    p_start: pStart, p_cameo: pCameo,
    p60: isGoalkeeper ? pStart * p60GivenStart : num(b.p60),
    p60_given_start: p60GivenStart,
    exp_min_start: num(b.exp_min_start), exp_min_cameo: num(b.exp_min_cameo),
    wc_load_flag: Boolean(b.wc_load_flag),
    minutes_source: "forecast",
  };
}

/* Expected minutes implied by a resolved set. One definition, so the job and the app cannot disagree
   about what "expected minutes" means either. */
export function expectedMinutesOf(m) {
  if (!m) return null;
  const v = num(m.p_start) * num(m.exp_min_start) + num(m.p_cameo) * num(m.exp_min_cameo);
  return v > 0 ? v : 0;
}
/* WHICH INPUTS PRODUCED A PROJECTION, AS A SHORT STAMP.
 *
 * Freshness is decided by comparing stamps, never by judging whether a number looks too small. The old
 * rule asked "is this projection less than half what a starter in this position is worth?", which is a
 * question about the ANSWER, and it threw away correct engine output whenever the engine legitimately
 * disagreed with the position average. A stamp asks about the INPUTS: if the eleven or the availability
 * that fed the run has changed since, the row is out of date and says so. */
export function minutesInputVersion({ lineupVersion, status, chanceOfPlaying, minutesSource, confidence }) {
  const parts = [
    MINUTES_RESOLVER_VERSION,
    lineupVersion || "no-lineups",
    minutesSource || "forecast",
    confidence === undefined || confidence === null ? "-" : String(confidence),
    String(status ?? "a"),
    chanceOfPlaying === null || chanceOfPlaying === undefined ? "-" : String(chanceOfPlaying),
  ].join("|");
  return `${parts.length}-${djb2(parts)}`;
}
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
/* A stable identifier for the predicted-eleven file in force. Its capture date plus the number of clubs
   it covers changes whenever the file is refreshed, which is all the stamp needs to detect. */
export function lineupVersionOf(lineups) {
  if (!lineups) return "no-lineups";
  const clubs = Array.isArray(lineups.clubs) ? lineups.clubs.length : 0;
  const c = lineups.official ? 1 : (lineups.confidence ?? 1);
  const gw = Number.isFinite(Number(lineups.gameweek)) ? Number(lineups.gameweek) : "current";
  return `${lineups.captured || "undated"}#gw${gw}#${clubs}@${c}`;
}
/* The confidence and provenance in force, read from the lineup file so the number and its source cannot
   drift apart. */
export function lineupTrustOf(lineups) {
  return {
    source: lineups?.source || null,
    captured: lineups?.captured || null,
    official: Boolean(lineups?.official),
    confidence: lineups?.official ? 1 : Math.max(0, Math.min(1, Number(lineups?.confidence ?? 1))),
  };
}
/* Turn resolved lineups into a per-player lookup of "starter" | "notNamed".
 *
 * The confidence guard from lib/lineups.mjs is preserved and applies to the same decision it always did:
 * a club whose names mostly failed to resolve does not get its unnamed players demoted, because the
 * failure is ours and the honest answer is to leave that club's forecast alone. Named starters are always
 * honoured, because a match that succeeded is evidence either way. */
export function lineupRolesOf(resolution, players) {
  const { byClub, startingIds, teamOverrideByFplId = new Map() } = resolution;
  const roles = new Map();
  for (const { club, lines, valid } of byClub.values()) {
    if (!club) continue;
    for (const x of lines.flat()) if (x.player) roles.set(x.player.fpl_id, "starter");
    // Only a complete internally valid XI is strong enough to demote every other squad player.
    if (!valid) continue;
    for (const p of players) {
      const effectiveTeam = teamOverrideByFplId.get(p.fpl_id) ?? p.team_id;
      if (effectiveTeam !== club.id || startingIds.has(p.fpl_id)) continue;
      roles.set(p.fpl_id, "notNamed");
    }
  }
  return roles;
}
