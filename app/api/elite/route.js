/* WHAT THE BEST MANAGERS ACTUALLY OWN.
 *
 * This is the one question no projection can answer and no content creator can either. Ownership across all
 * eleven million tells you the template. Ownership among the top few hundred tells you what people who are
 * actually winning think, and the GAP between those two numbers is the differential signal a rank one target
 * needs: a player at 8 percent overall and 40 percent elite is being backed by the people who know, and is
 * still a differential.
 *
 * The data is public. League 314 is the overall table, and each manager's picks are readable per gameweek.
 * Before the first gameweek is played the table is empty, and this says so rather than inventing a figure.
 * Nothing here is a projection: it is a count of what people own.
 */
import { loadForServer } from "../../../lib/server/load.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = { "User-Agent": "Mozilla/5.0 (compatible; fplbot)" };
const n1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—");

async function fplJson(url) {
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) throw new Error(`FPL returned ${r.status} for ${url.split("/api/")[1]}`);
  return r.json();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    /* Kept modest on purpose: each manager is a separate request, and a hundred is plenty to see a pattern
       while staying inside a serverless timeout. */
    const sample = Math.max(10, Math.min(100, Number(url.searchParams.get("managers")) || 50));

    const { players, gw } = await loadForServer();
    const L = [];
    L.push(`WHAT THE TOP MANAGERS OWN`);
    L.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
    L.push("");

    const table = await fplJson("https://fantasy.premierleague.com/api/leagues-classic/314/standings/");
    const results = (table.standings && table.standings.results) || [];

    if (!results.length) {
      L.push(`  The overall table is empty, so no gameweek has been scored yet. There is NO data on what`);
      L.push(`  elite managers own, and there will not be until GW1 has been played.`);
      L.push("");
      L.push(`  Do not substitute content creators for this. A creator's picks are what he is willing to`);
      L.push(`  publish, not what a top manager holds, and the two differ. If asked what top managers are`);
      L.push(`  doing before the season starts, the honest answer is that nobody knows, and the best available`);
      L.push(`  proxy is overall ownership in the brief plus whatever transcripts are attached, clearly`);
      L.push(`  labelled as sentiment.`);
      return new Response(L.join("\n"), {
        status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    /* The gameweek to read: the last one scored, not the one being planned. */
    const readGw = Math.max(1, gw - 1);
    const top = results.slice(0, sample);

    const counts = new Map();
    const captains = new Map();
    let ok = 0;
    for (const m of top) {
      try {
        const picks = await fplJson(`https://fantasy.premierleague.com/api/entry/${m.entry}/event/${readGw}/picks/`);
        for (const p of picks.picks || []) {
          counts.set(p.element, (counts.get(p.element) || 0) + 1);
          if (p.is_captain) captains.set(p.element, (captains.get(p.element) || 0) + 1);
        }
        ok++;
      } catch {
        /* One unreadable manager is not a reason to fail the whole answer. */
      }
    }

    if (!ok) {
      L.push(`  The table has entries but no squad could be read, so this cannot be answered right now.`);
      return new Response(L.join("\n"), {
        status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    L.push(`Read from the top ${ok} managers in the overall table, their GW${readGw} squads.`);
    L.push("");

    const rows = [...counts.entries()].map(([id, n]) => {
      const p = players.find((x) => x.fpl_id === id) || null;
      const elite = (n / ok) * 100;
      const overall = p ? Number(p.own) || 0 : 0;
      return { p, id, elite, overall, gap: elite - overall, caps: captains.get(id) || 0 };
    }).filter((r) => r.p);

    L.push(`MOST OWNED AMONG THE TOP ${ok}`);
    L.push(`  name, position, club, price, elite own%, overall own%, gap`);
    for (const r of [...rows].sort((a, b) => b.elite - a.elite).slice(0, 20)) {
      L.push(`    ${r.p.web_name}, ${r.p.position}, ${r.p.team}, ${n1(r.p.price)}, ${n1(r.elite)}%, ${n1(r.overall)}%, ${r.gap > 0 ? "+" : ""}${n1(r.gap)}`);
    }
    L.push("");

    /* THE ACTUAL SIGNAL. A big positive gap is a player the good managers back and the field has not caught
       up to, which is the definition of a differential worth owning. */
    L.push(`BACKED BY THE TOP ${ok} MORE THAN BY THE FIELD, biggest gap first`);
    L.push(`  These are differentials with evidence behind them rather than punts.`);
    for (const r of [...rows].sort((a, b) => b.gap - a.gap).slice(0, 15)) {
      L.push(`    ${r.p.web_name}, ${r.p.position}, ${r.p.team}, ${n1(r.p.price)}, elite ${n1(r.elite)}% against overall ${n1(r.overall)}%, gap +${n1(r.gap)}`);
    }
    L.push("");

    L.push(`OWNED BY THE FIELD MORE THAN BY THE TOP ${ok}, biggest gap first`);
    L.push(`  Template players the better managers are avoiding. Holding these costs rank without protecting it.`);
    for (const r of [...rows].sort((a, b) => a.gap - b.gap).slice(0, 15)) {
      L.push(`    ${r.p.web_name}, ${r.p.position}, ${r.p.team}, ${n1(r.p.price)}, elite ${n1(r.elite)}% against overall ${n1(r.overall)}%, gap ${n1(r.gap)}`);
    }
    L.push("");

    const capRows = [...captains.entries()].map(([id, n]) => {
      const p = players.find((x) => x.fpl_id === id);
      return p ? { p, pct: (n / ok) * 100 } : null;
    }).filter(Boolean).sort((a, b) => b.pct - a.pct).slice(0, 8);
    if (capRows.length) {
      L.push(`WHO THEY CAPTAINED IN GW${readGw}`);
      for (const c of capRows) L.push(`    ${c.p.web_name}, ${c.p.team}, ${n1(c.pct)}%`);
      L.push("");
    }

    L.push(`WHAT THIS IS AND IS NOT`);
    L.push(`  A count of what ${ok} managers owned in GW${readGw}. Not a projection, and not advice.`);
    L.push(`  Being top of the overall table after a few gameweeks is partly luck, so early in a season this`);
    L.push(`  is a weaker signal than it becomes later. Say so when the sample is a handful of gameweeks old.`);
    L.push(`  It is also last gameweek's squads, so it shows what they held, not what they are about to do.`);

    return new Response(L.join("\n"), {
      status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(
      `What top managers own could not be fetched: ${e.message}\n`
      + `Say so rather than substituting content creators for it: what a creator publishes is not what a top\n`
      + `manager holds.`,
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
