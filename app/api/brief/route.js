/* THE BRIEF.
 *
 * Plain text, not JSON, because a language model reads it directly and prose costs fewer tokens than braces.
 * Read-only. Everything here comes from the same scorer the pages use, so a chat and a screen cannot give
 * different numbers.
 *
 * The order is deliberate: the squad and the decisions come first because that is what most questions are
 * about, and the long tables come last. A model reads the top of a document most carefully.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import { blanksAndDoubles } from "../../../lib/server/fixtures.mjs";

export const dynamic = "force-dynamic";

const n1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—");

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const weeks = Math.max(1, Math.min(10, Number(url.searchParams.get("weeks")) || 6));
    const depth = Math.max(5, Math.min(30, Number(url.searchParams.get("depth")) || 12));

    const { teamRows, teamById, players, fixtures, gw, scorer, lineupsCaptured } = await loadForServer();
    const lastGw = gw + weeks - 1;
    const L = [];

    L.push(`FPL BRIEF`);
    L.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Current gameweek ${gw}.`);
    L.push(`Predicted line-ups captured ${lineupsCaptured || "unknown"}. Ownership is a snapshot for today.`);
    L.push("");

    /* xPTS over the window, and for one gameweek. */
    const xpOne = (p) => { const v = scorer.scoreForGw ? scorer.scoreForGw(p, gw) : scorer.scoreOf(p); return Number.isFinite(Number(v)) ? Number(v) : 0; };
    const xpWindow = (p) => {
      let t = 0;
      for (let g = gw; g <= lastGw; g++) {
        const v = scorer.scoreForGw ? scorer.scoreForGw(p, g) : null;
        if (Number.isFinite(Number(v))) t += Number(v);
      }
      return t || xpOne(p) * weeks;
    };

    /* BLANKS AND DOUBLES first, because chip questions turn on them. */
    const ids = teamRows.map((t) => t.id);
    const { blanks, doubles } = blanksAndDoubles(fixtures, ids, gw, lastGw);
    L.push(`BLANK AND DOUBLE GAMEWEEKS, GW${gw} to GW${lastGw}`);
    if (!blanks.size && !doubles.size) {
      L.push(`  None in this window. Every club plays exactly once each gameweek.`);
    } else {
      for (let g = gw; g <= lastGw; g++) {
        const b = (blanks.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        const d = (doubles.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        if (b.length) L.push(`  GW${g} BLANK for ${b.join(" ")}`);
        if (d.length) L.push(`  GW${g} DOUBLE for ${d.join(" ")}`);
      }
    }
    L.push("");

    /* THE MARKET, by position, on both projection and value. */
    L.push(`TOP ${depth} PER POSITION, xPTS FOR GW${gw} AND ACROSS GW${gw}-GW${lastGw}`);
    L.push(`  name, club, price, own%, xPTS this week, xPTS over window, xPTS per million over window`);
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
      const list = players.filter((p) => p.position === pos && p.status === "a")
        .map((p) => ({ p, one: xpOne(p), win: xpWindow(p) }))
        .sort((a, b) => b.win - a.win).slice(0, depth);
      L.push(`  ${pos}`);
      for (const { p, one, win } of list) {
        const per = Number(p.price) > 0 ? win / Number(p.price) : 0;
        L.push(`    ${p.web_name}, ${p.team}, ${n1(p.price)}, ${n1(p.own)}%, ${n1(one)}, ${n1(win)}, ${per.toFixed(2)}`);
      }
    }
    L.push("");

    /* BEST VALUE, separately, because the cheapest route to points is a different question. */
    L.push(`BEST xPTS PER MILLION OVER GW${gw}-GW${lastGw}, ANY POSITION, TOP ${depth}`);
    const byValue = players.filter((p) => p.status === "a" && Number(p.price) > 0)
      .map((p) => ({ p, win: xpWindow(p) }))
      .map((x) => ({ ...x, per: x.win / Number(x.p.price) }))
      .sort((a, b) => b.per - a.per).slice(0, depth);
    for (const { p, win, per } of byValue) {
      L.push(`    ${p.web_name}, ${p.position}, ${p.team}, ${n1(p.price)}, ${n1(p.own)}%, ${n1(win)}, ${per.toFixed(2)}`);
    }
    L.push("");

    /* MOST OWNED, which is the template and therefore the thing to differ from. */
    L.push(`MOST OWNED, TOP ${depth}. This is the template: a squad of these cannot finish first.`);
    for (const p of [...players].sort((a, b) => b.own - a.own).slice(0, depth)) {
      L.push(`    ${p.web_name}, ${p.position}, ${p.team}, ${n1(p.price)}, ${n1(p.own)}%, ${n1(xpWindow(p))}`);
    }
    L.push("");

    /* FIXTURES, all clubs, so a run can be judged. */
    L.push(`FIXTURES GW${gw} TO GW${lastGw}, opponent and venue`);
    for (const t of [...teamRows].sort((a, b) => (a.short_name || "").localeCompare(b.short_name || ""))) {
      const runs = [];
      for (let g = gw; g <= lastGw; g++) {
        const fs = fixtures.filter((f) => Number(f.gw) === g && (f.home_team === t.id || f.away_team === t.id));
        if (!fs.length) { runs.push("BLANK"); continue; }
        runs.push(fs.map((f) => {
          const home = f.home_team === t.id;
          const opp = teamById[home ? f.away_team : f.home_team];
          return `${opp ? opp.short_name : "?"}${home ? "(H)" : "(A)"}`;
        }).join("+"));
      }
      L.push(`    ${t.short_name}: ${runs.join(" ")}`);
    }
    L.push("");

    L.push(`WHAT THIS BRIEF DOES NOT KNOW`);
    L.push(`  These projections have never been checked against a played gameweek. The shrinkage constant is`);
    L.push(`  derived from variance rather than backtested, clean sheet probability is uncalibrated, and the`);
    L.push(`  simulation engine has no backtest. Treat every figure as the best available estimate. Say so`);
    L.push(`  when an answer depends on one of them being right to within half a point.`);
    L.push(`  Ownership is today's snapshot and moves a great deal before a deadline.`);
    L.push(`  There is no team news after the line-up capture date above, no price change forecast, and no`);
    L.push(`  data on what the top hundred managers actually own.`);

    return new Response(L.join("\n"), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(`The brief could not be built: ${e.message}`, {
      status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
