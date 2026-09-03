import { loadForServer } from "../../../lib/server/load.mjs";
import { EXTERNAL_XPTS_GW_FROM, EXTERNAL_XPTS_GW_TO } from "../../../lib/external_xpts.mjs";
import { LINEUP_GATE_APPLIES_FROM, LINEUP_GATE_APPLIES_TO } from "../../../lib/lineup-xpts.mjs";
import EXTERNAL_XPTS_DATA from "../../../config/external-xpts-2026-27.mjs";

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

    const wantedName = normalise(params.get("name"));
    const wantedClub = normalise(params.get("club"));
    const wantedPosition = normalise(params.get("position"));
    const minimum = Number(params.get("min_xpts"));
    const limit = Math.min(Math.max(Number(params.get("limit")) || 1000, 1), 1000);

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
        club_name: (teamById.get(Number(player.team_id)) || {}).name || null,
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
