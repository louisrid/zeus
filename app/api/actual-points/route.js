/* WHAT A PLAYER ACTUALLY SCORED, NOT WHAT HE WAS EXPECTED TO.
 *
 * Every per-gameweek number in this app is a projection, and it stayed a projection after the match had
 * been played. So a finished gameweek showed Haaland on 7.2 expected when he had in fact scored 13, and
 * a squad's total for a week that had already happened was a forecast of the past. Nothing in the
 * database held per-player per-gameweek points: `players.total_points` is a season total, and there is
 * no history table with the weekly split.
 *
 * The official API has it, one call per gameweek, so this route fetches it and says plainly which
 * gameweeks are settled. It also reports fixture state, because a number is only meaningful alongside
 * whether the game has been played:
 *
 *   not_started   nothing has kicked off, so the projection is the only answer
 *   live          at least one fixture is in progress, so points are real but still moving
 *   finished      every fixture is done and the points are final
 *
 * CACHED FOR A MINUTE. During a live gameweek the numbers move every few minutes, and every visitor
 * asking the official API on every page load would be both slow and rude. A minute is fresh enough to
 * watch a match with and cheap enough to serve.
 */

import { loadForServer } from "../../../lib/server/load.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_URL = (gw) => `https://fantasy.premierleague.com/api/event/${gw}/live/`;
const CACHE_SECONDS = 60;

const cache = new Map();

async function livePoints(gw) {
  const hit = cache.get(gw);
  if (hit && Date.now() - hit.at < CACHE_SECONDS * 1000) return hit.rows;
  const response = await fetch(LIVE_URL(gw), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`The official API returned ${response.status} for GW${gw}.`);
  const body = await response.json();
  const rows = new Map();
  for (const element of body?.elements || []) {
    const stats = element?.stats || {};
    rows.set(Number(element.id), {
      points: Number(stats.total_points) || 0,
      minutes: Number(stats.minutes) || 0,
      goals: Number(stats.goals_scored) || 0,
      assists: Number(stats.assists) || 0,
      clean_sheet: Number(stats.clean_sheets) > 0,
      bonus: Number(stats.bonus) || 0,
    });
  }
  cache.set(gw, { at: Date.now(), rows });
  return rows;
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const core = await loadForServer();
    const from = Math.max(1, Number(params.get("gw_from")) || core.gw || 1);
    const to = Math.min(38, Math.max(from, Number(params.get("gw_to")) || from));
    /* A hard ceiling on the span. Each gameweek is a separate call to the official API, so an unbounded
       range would be dozens of requests behind one page load. */
    if (to - from > 9) {
      return Response.json({ ok: false, error: "Ask for ten gameweeks at most in one request." }, { status: 400 });
    }

    const now = Date.now();
    const weeks = {};
    for (let gw = from; gw <= to; gw += 1) {
      const fixtures = (core.fixtures || []).filter((fixture) => Number(fixture.gw) === gw);
      const kickoffs = fixtures
        .map((fixture) => (fixture.kickoff_utc ? new Date(fixture.kickoff_utc).getTime() : null))
        .filter((value) => Number.isFinite(value));
      const started = kickoffs.some((kickoff) => kickoff <= now);
      /* Finished is taken from the fixture rows rather than guessed from the clock: a match runs well
         past ninety minutes once stoppages and delays are counted, and bonus points land later still. */
      const allDone = fixtures.length > 0 && fixtures.every((fixture) => fixture.finished === true);

      const state = !started ? "not_started" : allDone ? "finished" : "live";
      const week = { gameweek: gw, state, fixtures: fixtures.length };

      if (state !== "not_started") {
        try {
          const rows = await livePoints(gw);
          week.players = Object.fromEntries([...rows.entries()].map(([id, stats]) => [id, stats]));
          week.player_count = rows.size;
        } catch (error) {
          /* A failed fetch must not take the page down with it. The week reports why it has no numbers
             and the caller falls back to the projection, which is what it would have shown anyway. */
          week.error = String(error.message || error);
        }
      }
      weeks[gw] = week;
    }

    return Response.json({
      ok: true,
      source: "Official FPL API",
      current_gameweek: core.gw,
      requested_range: { from, to },
      cache_seconds: CACHE_SECONDS,
      rule: "Use these points wherever the state is live or finished. Use xPTS only where it is not_started.",
      generated_at: new Date().toISOString(),
      weeks,
    }, { headers: { "cache-control": `public, max-age=${CACHE_SECONDS}` } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
