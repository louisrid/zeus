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
    const wanted = (url.searchParams.get("plan") || "").trim().toLowerCase();

    const { teamRows, teamById, players, fixtures, gw, scorer, plans, lineupsCaptured } = await loadForServer();
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

    /* LOUIS'S OWN SQUAD, FIRST.
     *
     * Almost every question is about the team he owns, so it goes above the market. The first two versions
     * of this brief left it out entirely and described the whole league instead, which meant the model could
     * only ever answer in the abstract. */
    const plan = (plans || []).find((pl) => pl.is_active) || (plans || [])[0] || null;
    L.push(`YOUR SQUAD`);
    if (!plan || !Array.isArray(plan.players) || !plan.players.length) {
      L.push(`  No saved draft found. Anything about "my squad" needs Louis to paste his fifteen, or to save`);
      L.push(`  a draft in the Builder first. Do not invent a squad for him.`);
    } else {
      const byId = new Map(players.map((p) => [p.fpl_id, p]));
      const rows = plan.players.map((x) => ({ ...x, p: byId.get(x.fpl_id) })).filter((x) => x.p);
      const spend = rows.reduce((a, x) => a + Number(x.p.price), 0);
      const xi = rows.filter((x) => x.starting), bench = rows.filter((x) => !x.starting);
      const total = xi.reduce((a, x) => a + xpOne(x.p) * (plan.captain === x.fpl_id ? 2 : 1), 0);

      L.push(`  Draft "${plan.name || "unnamed"}", shape ${plan.structure || "unknown"}, ${rows.length} players.`);
      L.push(`  Spent ${n1(spend)} of 100.0, so ${n1(100 - spend)} in the bank.`);
      L.push(`  Projected ${n1(total)} for GW${gw} with the captain doubled.`);
      const line = (x, mark) => `    ${x.p.web_name}${mark}, ${x.p.position}, ${x.p.team}, ${n1(x.p.price)}, ${n1(x.p.own)}%, ${n1(xpOne(x.p))} this week, ${n1(xpWindow(x.p))} over the window`;
      L.push(`  starting eleven`);
      for (const x of xi) L.push(line(x, plan.captain === x.fpl_id ? " (C)" : plan.vice === x.fpl_id ? " (V)" : ""));
      L.push(`  bench`);
      for (const x of bench) L.push(line(x, ""));
      if ((plans || []).length > 1) {
        L.push(`  Other saved drafts: ${plans.slice(1, 6).map((pl) => pl.name || "unnamed").join(", ")}.`);
      }
    }
    L.push("");

    /* BLANKS AND DOUBLES, because chip questions turn on them. */
    /* LOUIS'S OWN SQUAD, FIRST.
     *
     * Almost every question he asks is about the team he owns, and the first two versions of this brief
     * shipped without it because the rows were fetched and thrown away. It defaults to whichever draft is
     * marked active, or the most recently edited, and ?plan=name picks a specific one so any saved draft can
     * be examined. Every draft is named either way, so the model knows what exists.
     */
    const byName = wanted ? plans.find((x) => String(x.name || "").toLowerCase().includes(wanted)) : null;
    const chosen = byName || plans.find((x) => x.is_active) || plans[0] || null;

    if (!chosen) {
      L.push("LOUIS'S SQUAD");
      L.push("  No saved draft yet, so answer about the market rather than about a team he owns.");
      L.push("");
    } else {
      L.push(`SAVED DRAFTS: ${plans.map((x) => `${x.name}${x.is_active ? " (active)" : ""}`).join(", ")}`);
      if (wanted && !byName) L.push(`  Nothing matched "${wanted}", so this is the active or newest draft.`);
      L.push("");

      const base = Array.isArray(chosen.base) ? chosen.base : [];
      const week = (chosen.weeks && chosen.weeks[String(gw)]) || {};
      const startIds = new Set(Array.isArray(week.startingIds) ? week.startingIds : []);
      const captain = week.captain ?? chosen.captain ?? null;
      const vice = week.vice ?? chosen.vice ?? null;
      const rows = base.map((b) => {
        const pl = players.find((x) => x.fpl_id === b.fpl_id) || null;
        return { b, pl, one: pl ? xpOne(pl) : 0, win: pl ? xpWindow(pl) : 0 };
      });
      const spent = rows.reduce((a, r) => a + (Number(r.b.price ?? (r.pl ? r.pl.price : 0)) || 0), 0);

      L.push(`LOUIS'S SQUAD: "${chosen.name}", shape ${chosen.structure || "unknown"}, viewed at GW${gw}`);
      L.push(`  spent ${n1(spent)} of 100, ${n1(100 - spent)} in the bank`);
      L.push(`  name, position, club, price, own%, xPTS this week, xPTS over window, role`);
      for (const r of rows) {
        const nm = r.pl ? r.pl.web_name : `unknown player ${r.b.fpl_id}`;
        const role = [
          startIds.size ? (startIds.has(r.b.fpl_id) ? "starting" : "bench") : "",
          captain === r.b.fpl_id ? "CAPTAIN" : "",
          vice === r.b.fpl_id ? "vice" : "",
        ].filter(Boolean).join(" ") || "no role set";
        L.push(`    ${nm}, ${r.pl ? r.pl.position : "?"}, ${r.pl ? r.pl.team : "?"}, ${n1(r.b.price ?? (r.pl ? r.pl.price : null))}, ${r.pl ? n1(r.pl.own) : "-"}%, ${n1(r.one)}, ${n1(r.win)}, ${role}`);
      }
      const xiTotal = rows.filter((r) => !startIds.size || startIds.has(r.b.fpl_id))
        .reduce((a, r) => a + r.win + (captain === r.b.fpl_id ? r.win : 0), 0);
      L.push(`  his eleven across GW${gw} to GW${lastGw}, captain doubled: ${n1(xiTotal)}`);

      const nameOf = (id) => { const pl = players.find((x) => x.fpl_id === id); return pl ? pl.web_name : String(id); };
      const may = Array.isArray(chosen.maybe_ids) ? chosen.maybe_ids : [];
      const ign = Array.isArray(chosen.ignores) ? chosen.ignores : [];
      if (may.length) L.push(`  shortlisted: ${may.map(nameOf).join(", ")}`);
      if (ign.length) L.push(`  ruled out, do not suggest these: ${ign.map(nameOf).join(", ")}`);
      L.push("");
    }

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
