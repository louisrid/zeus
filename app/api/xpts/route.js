import { loadForServer } from "../../../lib/server/load.mjs";
import { EXTERNAL_XPTS_GW_FROM, EXTERNAL_XPTS_GW_TO } from "../../../lib/external_xpts.mjs";
import { LINEUP_GATE_APPLIES_FROM, LINEUP_GATE_APPLIES_TO } from "../../../lib/lineup-xpts.mjs";
import EXTERNAL_XPTS_DATA from "../../../config/external-xpts-2026-27.mjs";
import FDR from "../../../config/fdr-2026-27.mjs";
import DEFCON_LIVE from "../../../config/defcon-live-2026-27.mjs";

/* THE NUMBERS, READABLE FROM ANYWHERE.
 *
 * Reading what ZEUS actually projects meant going through the Letta agent, because the only machine
 * readable surface was /api/brief, which needs a bearer token and answers about saved squads rather
 * than about players. So a conversation that wanted one player's xPTS had to route through an agent
 * that could be out of date, be holding a stale tool, or paraphrase, and there was no way to check it
 * against anything. This is the same data the site draws, served as JSON to anyone who asks.
 *
 * DELIBERATELY UNAUTHENTICATED. It exposes projections for public footballers, which is neither
 * personal data nor a secret, and every other read route on this site is already open. A token here
 * would only mean a token pasted into chats, which is a worse outcome than an open read.
 *
 * It is built through loadForServer, the same loader every page uses, so the figures cannot drift from
 * what the app shows. That matters more than speed: a second implementation would eventually disagree,
 * and a number that disagrees with the site is worse than no number.
 *
 *   /api/xpts                         every player, current gameweek
 *   /api/xpts?gw_from=3&gw_to=5       summed across a range, with the per-gameweek split
 *   /api/xpts?name=haaland            one player, matched loosely
 *   /api/xpts?club=MCI&position=MID   filtered
 *   /api/xpts?view=lineups            the predicted elevens the gate is built from
 *   /api/xpts?view=fixtures           the fixture list, with blanks and doubles marked
 *   /api/xpts?view=fdr&gw_from=5&gw_to=9   every club's run over a range, ranked easiest first
 *   /api/xpts?view=defcon             defensive contribution per 90, this season and last, side by side
 *   /api/xpts?format=text             compact text, for reading rather than parsing
 */

export const dynamic = "force-dynamic";

const clampGw = (value, fallback) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, EXTERNAL_XPTS_GW_FROM), EXTERNAL_XPTS_GW_TO);
};

const normalise = (text) => String(text || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const core = await loadForServer();
    const { players, scorer, teamById, gw } = core;

    const gwFrom = clampGw(params.get("gw_from"), gw || EXTERNAL_XPTS_GW_FROM);
    const gwTo = clampGw(params.get("gw_to"), gwFrom);
    const from = Math.min(gwFrom, gwTo);
    const to = Math.max(gwFrom, gwTo);

    const meta = {
      ok: true,
      source: EXTERNAL_XPTS_DATA.source,
      source_url: EXTERNAL_XPTS_DATA.source_url,
      imported_at: EXTERNAL_XPTS_DATA.imported_at,
      season: EXTERNAL_XPTS_DATA.season,
      current_gameweek: gw,
      /* Two different bounds, and conflating them is the mistake this names explicitly. The horizon is
         how far points are served. The gate window is how far the predicted elevens zero a player his
         club leaves out. Inside the gate a non-starter reads 0.0 and that is the intended answer, not a
         missing value. */
      served_gameweeks: { from: EXTERNAL_XPTS_GW_FROM, to: EXTERNAL_XPTS_GW_TO },
      lineup_gate: {
        from: LINEUP_GATE_APPLIES_FROM,
        to: LINEUP_GATE_APPLIES_TO,
        rule: "A player the published eleven leaves out scores 0 inside this window. The raw imported value is kept for audit.",
      },
      requested_range: { from, to },
      player_count: players.length,
      generated_at: new Date().toISOString(),
    };

    /* FIXTURES, HERE RATHER THAN BEHIND A TOKEN.
     *
     * /api/fixtures/query exists but requires a bearer token, which is fine for the site and useless for
     * a conversation: pasting a token into a chat is a worse idea than the data being open, and this is
     * a football schedule. Serving it beside the projections also means one URL answers "who plays whom,
     * and what is he worth", which is the question actually being asked. */
    /* WHOSE RUN IS EASIEST.
     *
     * "Which club has the best fixtures over the next five" was a question that could only be answered by
     * reading a table and adding up in your head. The official ratings run 1 to 5, so a run is a sum, and
     * the answer is more useful ranked than listed. A blank counts as no fixture rather than an easy one,
     * which is why the average is over matches actually played and the count travels with it: three easy
     * games is not the same as five, and a mean alone would hide that. */
    /* Declared before any view runs, because the defcon and fixture views filter on them too. Leaving
       them below meant a view that used them threw at runtime while compiling perfectly. */
    const wantedName = normalise(params.get("name"));
    const wantedClub = normalise(params.get("club"));
    const wantedPosition = normalise(params.get("position"));
    const minimum = Number(params.get("min_xpts"));
    const limit = Math.min(Math.max(Number(params.get("limit")) || 1000, 1), 1000);

    if (params.get("view") === "fdr") {
      const runs = [];
      for (const [club, weeks] of Object.entries(FDR.clubs || {})) {
        const fixtures = [];
        for (let week = from; week <= to; week += 1) {
          for (const match of (weeks[week] || weeks[String(week)] || [])) {
            /* The whole match, not a hand-picked four fields. Listing them meant `relative` was dropped
               on the way in, so every average_relative summed an empty list and came back null while the
               data behind it was correct all along. */
            fixtures.push({ gw: week, ...match });
          }
        }
        const rated = fixtures.filter((match) => Number.isFinite(match.difficulty));
        const total = rated.reduce((sum, match) => sum + match.difficulty, 0);
        const relatives = fixtures.filter((match) => Number.isFinite(match.relative));
        const relativeTotal = relatives.reduce((sum, match) => sum + match.relative, 0);
        runs.push({
          club,
          fixtures_played: fixtures.length,
          blanks: Array.from({ length: to - from + 1 }, (_, i) => from + i)
            .filter((week) => !(weeks[week] || weeks[String(week)] || []).length),
          doubles: Array.from({ length: to - from + 1 }, (_, i) => from + i)
            .filter((week) => (weeks[week] || weeks[String(week)] || []).length > 1),
          total_opponent_difficulty: total,
          average_opponent_difficulty: rated.length ? Math.round((total / rated.length) * 100) / 100 : null,
          /* Named for what it measures. "average_difficulty" reads like the difficulty of the run; it is
             the average strength of the opponents, which is a different thing and the whole confusion. */
          /* The same run judged against this club's own strength. Liverpool away is a 5 for everyone;
             relative says whether it is a 5 for YOU, which is the comparison a transfer actually needs. */
          total_relative: Math.round(relativeTotal * 100) / 100,
          average_relative: relatives.length ? Math.round((relativeTotal / relatives.length) * 100) / 100 : null,
          fixtures,
        });
      }
      /* Easiest first, and a club with more matches wins a tie, because fixtures are the opportunity. */
      /* Ranked by the relative reading, because "who has the easiest run" only means something once each
         club is judged against itself. The absolute average is still returned for anyone who wants it. */
      /* The absolute figure is no longer offered as a ranking unless it is asked for by name, and it is
         renamed in the payload when it is not the ranking. A reader given two averages will rank by
         whichever one is populated and never mention the difference: that is exactly how Coventry, who
         are underdogs in three quarters of this run, came back as the club with the easiest fixtures.
         The column stays available because it is real; it just stops being mistakable for the answer. */
      const rankBy = params.get("rank") === "absolute" ? "average_difficulty" : "average_relative";
      const sortKey = rankBy === "average_difficulty" ? "average_opponent_difficulty" : rankBy;
      runs.sort((a, b) => (a[sortKey] ?? 99) - (b[sortKey] ?? 99)
        || b.fixtures_played - a.fixtures_played);
      /* The rank is stated rather than implied by array order, and each club is labelled favourites or
         underdogs in plain words. A number that has to be interpreted will be interpreted wrongly by
         someone, and this one already was. */
      const ranked = runs.map((run, index) => ({
        rank: index + 1,
        ...run,
        standing: run.average_relative === null ? "unknown"
          : run.average_relative < 0 ? "favourites in most of this run"
            : run.average_relative > 0 ? "underdogs in most of this run"
              : "evenly matched",
      }));
      return Response.json({
        ...meta,
        view: "fdr",
        ranked_by: params.get("rank") === "absolute" ? "average_difficulty" : "average_relative",
        scale: FDR.scale,
        note: FDR.note,
        /* Said in the response itself, because a reader who does not know this reads the absolute column
           as the answer and concludes Coventry have an easy run. Every club facing Coventry is given a 2,
           whether it is Arsenal or Hull: the official figure rates the OPPONENT and knows nothing about
           who is playing them. Verified against the fixture list rather than assumed. */
        how_to_read: "Rank by average_relative. average_opponent_difficulty rates the opponent only. Every club facing the same opponent gets "
          + "the same number, so it cannot say whose run is easier. average_relative is the one to rank by: "
          + "it is the opponent's strength minus this club's own, so negative means they are favourites in "
          + "that fixture and positive means they are the underdog.",
        ranked_easiest_first: ranked,
      });
    }

    if (params.get("view") === "defcon") {
      const rows = (DEFCON_LIVE.rows || [])
        .filter((row) => !wantedClub || normalise(row.club) === wantedClub)
        .filter((row) => !wantedPosition || normalise(row.position) === wantedPosition)
        .filter((row) => !wantedName || normalise(row.name).includes(wantedName))
        .sort((a, b) => (b.per90 ?? -1) - (a.per90 ?? -1));
      return Response.json({
        ...meta,
        view: "defcon",
        note: DEFCON_LIVE.note,
        minutes_caution: DEFCON_LIVE.minutes_caution,
        players: rows.slice(0, limit),
      });
    }

    if (params.get("view") === "fixtures") {
      const inRange = (core.fixtures || [])
        .filter((fixture) => Number(fixture.gw) >= from && Number(fixture.gw) <= to);
      const shortOf = (id) => (teamById[Number(id)] || {}).short_name || null;
      /* A club with two fixtures in a week is a double and one with none is a blank. Both change what a
         player is worth far more than any rating does, so they are counted rather than left to be
         noticed. */
      const perClubPerGw = new Map();
      for (const fixture of inRange) {
        for (const id of [fixture.home_team, fixture.away_team]) {
          const key = `${shortOf(id)}:${fixture.gw}`;
          perClubPerGw.set(key, (perClubPerGw.get(key) || 0) + 1);
        }
      }
      const clubs = [...new Set(Object.values(teamById).map((team) => team.short_name))].sort();
      const blanks = [];
      const doubles = [];
      for (const club of clubs) {
        for (let week = from; week <= to; week += 1) {
          const count = perClubPerGw.get(`${club}:${week}`) || 0;
          if (count === 0) blanks.push({ club, gw: week });
          if (count > 1) doubles.push({ club, gw: week, fixtures: count });
        }
      }
      return Response.json({
        ...meta,
        view: "fixtures",
        fixtures: inRange.map((fixture) => ({
          gw: Number(fixture.gw),
          kickoff_utc: fixture.kickoff_utc || null,
          home: shortOf(fixture.home_team),
          away: shortOf(fixture.away_team),
          finished: Boolean(fixture.finished),
          home_goals: fixture.home_goals ?? null,
          away_goals: fixture.away_goals ?? null,
        })),
        blanks,
        doubles,
      });
    }

    if (params.get("view") === "lineups") {
      const clubs = new Map();
      for (const player of players) {
        const start = scorer.startProbForGw ? scorer.startProbForGw(player, from) : null;
        if (start === null || start === undefined) continue;
        const short = player.team;
        if (!clubs.has(short)) clubs.set(short, { club: short, predicted_starters: [], rest: [] });
        const row = { fpl_id: player.fpl_id, name: player.web_name, position: player.position };
        if (Number(start) >= 1) clubs.get(short).predicted_starters.push(row);
        else clubs.get(short).rest.push(row);
      }
      return Response.json({ ...meta, view: "lineups", clubs: [...clubs.values()] });
    }


    const rows = [];
    for (const player of players) {
      if (wantedClub && normalise(player.team) !== wantedClub) continue;
      if (wantedPosition && normalise(player.position) !== wantedPosition) continue;
      if (wantedName && !normalise(player.web_name).includes(wantedName)) continue;

      const byGw = {};
      let total = 0;
      for (let week = from; week <= to; week += 1) {
        const value = scorer.scoreForGw(player, week);
        byGw[week] = value === null || value === undefined ? null : Number(value);
        if (Number.isFinite(byGw[week])) total += byGw[week];
      }
      if (Number.isFinite(minimum) && total < minimum) continue;

      rows.push({
        fpl_id: player.fpl_id,
        name: player.web_name,
        club: player.team,
        /* teamById is a plain object keyed by id, not a Map. Calling .get on it threw for every
           request, so the whole endpoint answered "i.get is not a function" rather than any data. */
        club_name: (teamById[Number(player.team_id)] || {}).name || null,
        position: player.position,
        price: Number(player.price),
        ownership: Number(player.own) || 0,
        status: player.status,
        news: player.news || null,
        /* Whether the gate has anything to say about him this week, so a 0.0 can be told apart from a
           player who is simply projected to do nothing. */
        predicted_to_start: scorer.startProbForGw
          ? (scorer.startProbForGw(player, from) === null ? null : Number(scorer.startProbForGw(player, from)) >= 1)
          : null,
        xpts_total: Math.round(total * 100) / 100,
        xpts_by_gameweek: byGw,
      });
    }

    rows.sort((a, b) => b.xpts_total - a.xpts_total);
    const trimmed = rows.slice(0, limit);

    if (params.get("format") === "text") {
      const lines = [
        `ZEUS xPTS, GW${from}-GW${to}. Imported ${meta.imported_at}. Gate GW${LINEUP_GATE_APPLIES_FROM}-GW${LINEUP_GATE_APPLIES_TO}.`,
        "A player left out of his club's predicted eleven scores 0 inside the gate window.",
        "",
      ];
      for (const row of trimmed) {
        lines.push(`${row.name} (${row.club}, ${row.position}, ${row.price.toFixed(1)}) `
          + `${row.xpts_total.toFixed(2)} xPTS`
          + (row.predicted_to_start === false ? " [not in the predicted eleven]" : ""));
      }
      return new Response(lines.join("\n"), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return Response.json({ ...meta, returned: trimmed.length, players: trimmed });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
