/* OPTIMISE, over a URL.
 *
 * This is the half a chat cannot do. Choosing the best eleven from fifteen, or the best fifteen where all of
 * them score, is a search over a very large number of combinations. A language model asked to do it will
 * produce something that reads plausibly and is not optimal. The solver does it properly, so the model gets
 * an answer to reason about rather than a problem to guess at.
 *
 * modes
 *   xi        the best legal eleven from a squad, with bench order and armbands
 *   fifteen   the best squad where ALL FIFTEEN score, which is the bench boost question
 *   squad     the best regular squad, judged on the eleven, for comparison against fifteen
 *
 * Read-only. Nothing here writes anything.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import { blanksAndDoubles } from "../../../lib/server/fixtures.mjs";
import { bestXI } from "../../../lib/solver/autobuild.mjs";
import { bestFifteenAllPlaying, optimiseSquad } from "../../../lib/solver/optimise.mjs";

export const dynamic = "force-dynamic";

const n1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—");

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const mode = (url.searchParams.get("mode") || "xi").toLowerCase();
    const weeks = Math.max(1, Math.min(10, Number(url.searchParams.get("weeks")) || 1));
    const budget = Math.max(50, Math.min(120, Number(url.searchParams.get("budget")) || 100));

    const { teamRows, teamById, players, fixtures, gw, scorer } = await loadForServer();
    const lastGw = gw + weeks - 1;
    const L = [];

    const xpOf = (p) => {
      let t = 0, seen = 0;
      for (let g = gw; g <= lastGw; g++) {
        const v = scorer.scoreForGw ? scorer.scoreForGw(p, g) : null;
        if (Number.isFinite(Number(v))) { t += Number(v); seen++; }
      }
      if (seen) return t;
      const one = scorer.scoreOf(p);
      return Number.isFinite(Number(one)) ? Number(one) * weeks : 0;
    };
    const startProbOf = (p) => (scorer.startProbOf ? scorer.startProbOf(p) : null);
    const pool = players.filter((p) => p.status === "a" && Number(p.price) > 0);

    const show = (label, list) => {
      L.push(`  ${label}`);
      for (const p of list) {
        L.push(`    ${p.web_name}, ${p.position}, ${p.team}, ${n1(p.price)}, ${n1(p.own)}%, ${n1(xpOf(p))}`);
      }
    };

    L.push(`OPTIMISE, mode ${mode}, GW${gw} to GW${lastGw}, budget ${n1(budget)}`);
    L.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
    L.push("");

    if (mode === "fifteen" || mode === "benchboost") {
      const normal = bestXI({ pool, xpOf, budget, maxPerClub: 3, startProbOf, minStart: 0.55 });
      const seed = normal ? [...normal.xi, ...normal.bench] : null;
      const bb = bestFifteenAllPlaying({ pool, xpOf, budget, maxPerClub: 3, startProbOf, minStart: 0.55, seed });
      /* The eleven has to be LEGAL. Sorting all fifteen by projection and taking the top eleven produced a
         side with no goalkeeper, because keepers project lowest, and you cannot field that. optimiseSquad
         picks the best eleven that is actually allowed. */
      let fifteen = null;
      if (bb) {
        const shaped = optimiseSquad(
          { structure: "3-4-3", players: bb.players.map((p) => ({ ...p, starting: false })), captain: null, vice: null },
          xpOf,
        );
        const xi = shaped ? shaped.players.filter((p) => p.starting) : [];
        const rest = shaped ? shaped.players.filter((p) => !p.starting) : [];
        fifteen = {
          all: bb.players, xi, bench: rest, total: bb.total,
          xiTotal: xi.reduce((a, p) => a + (Number(xpOf(p)) || 0), 0),
          shape: shaped ? shaped.structure : "unknown",
        };
      }
      if (!fifteen) { L.push("No legal fifteen could be built under that budget."); }
      else {
        const nAll = normal ? [...normal.xi, ...normal.bench] : [];
        const nFifteen = nAll.reduce((a, p) => a + (Number(xpOf(p)) || 0), 0);
        const nXi = normal ? normal.xi.reduce((a, p) => a + (Number(xpOf(p)) || 0), 0) : 0;

        L.push(`THE BEST SQUAD WHERE ALL FIFTEEN SCORE`);
        L.push(`  The total is what matters under the chip, since every player scores. The eleven below is the`);
        L.push(`  legal side you would field in the weeks you are NOT using it, shape ${fifteen.shape}.`);
        L.push(`  all fifteen together: ${n1(fifteen.total)}   its eleven alone: ${n1(fifteen.xiTotal)}`);
        L.push(`  spent ${n1(fifteen.all.reduce((a, p) => a + Number(p.price), 0))}`);
        show("the eleven you would field, highest projections first", fifteen.xi);
        show("the four who also score under the chip", fifteen.bench);
        L.push("");
        L.push(`THE BEST ORDINARY SQUAD, judged on its eleven, for comparison`);
        L.push(`  all fifteen together: ${n1(nFifteen)}   its eleven alone: ${n1(nXi)}`);
        if (normal) { show("starting eleven", normal.xi); show("bench", normal.bench); }
        L.push("");
        L.push(`THE TRADE`);
        L.push(`  Building for the chip gains ${n1(fifteen.total - nFifteen)} across all fifteen.`);
        const cost = nXi - fifteen.xiTotal;
        if (cost > 0.05) {
          L.push(`  It costs ${n1(cost)} on the eleven, which is what you field every OTHER week.`);
          L.push(`  So the chip has to be worth more than that cost across the weeks you carry the squad.`);
        } else {
          L.push(`  It costs nothing on the eleven: this squad's best legal side is ${n1(-cost)} BETTER than the`);
          L.push(`  ordinary build's. Spending the full budget on fifteen players who can all play turns out to`);
          L.push(`  produce a stronger eleven as well, so on these projections there is no trade to weigh.`);
        }
        L.push(`  This is arithmetic on projections, not a recommendation. Whether the variance suits a rank one`);
        L.push(`  target is a judgement the numbers cannot make.`);
      }
    } else if (mode === "squad") {
      const r = bestXI({ pool, xpOf, budget, maxPerClub: 3, startProbOf, minStart: 0.55 });
      if (!r) L.push("No legal squad could be built under that budget.");
      else {
        const all = [...r.xi, ...r.bench];
        L.push(`THE BEST SQUAD, judged on its eleven`);
        L.push(`  eleven: ${n1(r.xi.reduce((a, p) => a + (Number(xpOf(p)) || 0), 0))}   spent ${n1(all.reduce((a, p) => a + Number(p.price), 0))}`);
        show("starting eleven", r.xi);
        show("bench", r.bench);
      }
    } else {
      /* mode=xi needs a squad to work from. Without one there is nothing to reorder, so say so plainly
         rather than inventing a squad and pretending it was the user's. */
      L.push(`Mode xi reorders a squad you already hold, and this endpoint has no squad to read.`);
      L.push(`Use mode=squad for the best fifteen from scratch, or mode=fifteen for the bench boost question.`);
    }

    /* Chip timing needs blanks and doubles, so they travel with the answer. */
    const { blanks, doubles } = blanksAndDoubles(fixtures, teamRows.map((t) => t.id), gw, gw + 9);
    L.push("");
    L.push(`BLANKS AND DOUBLES, GW${gw} TO GW${gw + 9}`);
    if (!blanks.size && !doubles.size) L.push(`  None. Every club plays once each gameweek in this window.`);
    else {
      for (let g = gw; g <= gw + 9; g++) {
        const b = (blanks.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        const d = (doubles.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        if (b.length) L.push(`  GW${g} BLANK for ${b.join(" ")}`);
        if (d.length) L.push(`  GW${g} DOUBLE for ${d.join(" ")}`);
      }
    }
    L.push("");
    L.push(`These projections have never been checked against a played gameweek. A squad that is optimal on`);
    L.push(`them is optimal on an estimate, not on the truth.`);

    return new Response(L.join("\n"), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(`The optimiser could not run: ${e.message}`, {
      status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
