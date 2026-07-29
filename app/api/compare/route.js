/* PER-GAMEWEEK DETAIL, AND SIDE BY SIDE COMPARISON.
 *
 * The brief gives one number for this week and one for the window, which is right for scanning a market but
 * useless the moment a question gets specific. Asked to show Thiago's next six fixtures with a projection
 * each, the model correctly said it could not, because the data was never exposed. It existed all along:
 * the scorer projects any player for any gameweek.
 *
 * This answers a whole class of question the brief cannot. Show me his run. Compare these three. Which of
 * them has the better fixtures in the next four. Where does this player's schedule turn.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import { blanksAndDoubles } from "../../../lib/server/fixtures.mjs";

export const dynamic = "force-dynamic";

const n1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—");
/* Points per goal and per clean sheet by position, so a breakdown can be priced correctly. A defender's goal
   is worth six and a forward's four, and a forward gets nothing for a clean sheet. */
const goalPointsFor = (pos) => ({ GKP: 6, DEF: 6, MID: 5, FWD: 4 }[pos] ?? 4);
const cleanSheetPointsFor = (pos) => ({ GKP: 4, DEF: 4, MID: 1, FWD: 0 }[pos] ?? 0);

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/* Find a player from a loose name. Exact short name first, then surname, then anything containing it. If two
   players match equally the caller is told rather than given a coin flip. */
function findPlayer(query, players) {
  const q = norm(query);
  if (!q) return { player: null, note: "empty name" };
  const exact = players.filter((p) => norm(p.web_name) === q);
  if (exact.length === 1) return { player: exact[0] };
  const surname = players.filter((p) => norm(p.name).split(" ").pop() === q);
  if (surname.length === 1) return { player: surname[0] };
  const loose = players.filter((p) => norm(p.web_name).includes(q) || norm(p.name).includes(q));
  if (loose.length === 1) return { player: loose[0] };
  if (loose.length > 1) {
    return { player: null, note: `matches ${loose.slice(0, 6).map((p) => `${p.web_name} (${p.team})`).join(", ")}, so be more specific` };
  }
  return { player: null, note: "no player found by that name" };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const raw = (url.searchParams.get("players") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const weeks = Math.max(1, Math.min(10, Number(url.searchParams.get("weeks")) || 6));

    const { teamRows, teamById, players, fixtures, gw, scorer, projections } = await loadForServer();
    const engineRow = (pl) => (projections ? projections.get(pl.fpl_id) : null) || null;
    const lastGw = gw + weeks - 1;
    const L = [];

    L.push(`PER GAMEWEEK PROJECTIONS, GW${gw} TO GW${lastGw}`);
    L.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
    L.push("");

    if (!raw.length) {
      L.push(`No player names given. Pass players=name,name,name to see a gameweek by gameweek breakdown.`);
      return new Response(L.join("\n"), { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }

    const { blanks, doubles } = blanksAndDoubles(fixtures, teamRows.map((t) => t.id), gw, lastGw);
    const found = [];
    for (const q of raw.slice(0, 6)) {
      const { player, note } = findPlayer(q, players);
      if (!player) { L.push(`"${q}": ${note}.`); L.push(""); continue; }
      found.push(player);
    }
    if (!found.length) {
      return new Response(L.join("\n"), { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }

    /* One block per player: the fixture, its difficulty, and the projection for that specific gameweek. */
    for (const p of found) {
      const rows = [];
      let total = 0;
      for (let g = gw; g <= lastGw; g++) {
        const fs = fixtures.filter((f) => Number(f.gw) === g && (f.home_team === p.team_id || f.away_team === p.team_id));
        const v = scorer.scoreForGw ? scorer.scoreForGw(p, g) : null;
        const xp = Number.isFinite(Number(v)) ? Number(v) : null;
        if (xp !== null) total += xp;
        if (!fs.length) { rows.push({ g, opp: "BLANK, no fixture", xp: 0 }); continue; }
        const opp = fs.map((f) => {
          const home = f.home_team === p.team_id;
          const o = teamById[home ? f.away_team : f.home_team];
          return `${o ? o.short_name : "?"} ${home ? "at home" : "away"}`;
        }).join(" and ");
        rows.push({ g, opp: fs.length > 1 ? `DOUBLE: ${opp}` : opp, xp });
      }

      const b = scorer.bandOf ? scorer.bandOf(p) : null;
      const c = b && Number.isFinite(Number(b.p90)) ? Number(b.p90) : null;
      const f = b && Number.isFinite(Number(b.p10)) ? Number(b.p10) : null;
      const t = scorer.tailOf ? scorer.tailOf(p) : null;
      L.push(`${p.web_name}, ${p.position}, ${p.team}, ${n1(p.price)}, owned by ${n1(p.own)}%`);
      /* The average alone made a defender look equal to the best striker in the league, because averaging
         thousands of simulations flattens the weeks that justify a premium price. */
      if (c !== null) {
        L.push(`  a good week ${n1(c)}, a bad week ${n1(f)}${t === null ? "" : `, chance of 10 or more ${Math.round(Number(t) * 100)}%`}`);
      }

      /* WHERE THE POINTS COME FROM.
       *
       * A single total cannot be argued with. Gabriel projected 7.6 away at Villa and clean sheets alone
       * account for barely a point of that, so something else was carrying it and nothing showed what. Broken
       * out, a wrong number becomes obvious: a defender with more expected goals than a striker, or a bonus
       * figure larger than the appearance points, is visibly wrong in a way a total never is.
       */
      const row = engineRow(p);
      if (row) {
        const g = Number(row.e_goals) || 0;
        const a = Number(row.e_assists) || 0;
        const cs = Number(row.p_cs) || 0;
        const bon = Number(row.e_bonus) || 0;
        const dc = Number(row.e_defcon) || 0;
        const gp = goalPointsFor(p.position);
        const parts = [
          ["appearance", 2],
          ["goals", g * gp],
          ["assists", a * 3],
          ["clean sheet", cs * cleanSheetPointsFor(p.position)],
          ["bonus", bon],
          ["defensive contribution", dc],
        ].filter(([, v]) => Math.abs(v) > 0.01);
        const sum = parts.reduce((x, [, v]) => x + v, 0);
        L.push(`  where the points come from: ${parts.map(([k, v]) => `${k} ${n1(v)}`).join(", ")}`);
        L.push(`  those add to ${n1(sum)}, and expected goals ${g.toFixed(2)}, assists ${a.toFixed(2)}, clean sheet chance ${Math.round(cs * 100)}%`);
      }
      L.push(`  gameweek, opponent, xPTS`);
      for (const r of rows) L.push(`    GW${r.g}, ${r.opp}, ${r.xp === null ? "no projection" : n1(r.xp)}`);
      L.push(`  total across GW${gw} to GW${lastGw}: ${n1(total)}`);
      L.push(`  per million: ${Number(p.price) > 0 ? (total / Number(p.price)).toFixed(2) : "—"}`);
      const best = rows.filter((r) => r.xp !== null).sort((a, b) => b.xp - a.xp)[0];
      const worst = rows.filter((r) => r.xp !== null).sort((a, b) => a.xp - b.xp)[0];
      if (best && worst && best.g !== worst.g) {
        L.push(`  best week GW${best.g} at ${n1(best.xp)}, worst GW${worst.g} at ${n1(worst.xp)}`);
      }
      L.push("");
    }

    /* Side by side, so a comparison does not require the reader to add up columns. */
    if (found.length > 1) {
      L.push(`SIDE BY SIDE, xPTS per gameweek`);
      L.push(`  gameweek, ${found.map((p) => p.web_name).join(", ")}`);
      for (let g = gw; g <= lastGw; g++) {
        const cells = found.map((p) => {
          const v = scorer.scoreForGw ? scorer.scoreForGw(p, g) : null;
          return Number.isFinite(Number(v)) ? n1(v) : "—";
        });
        L.push(`    GW${g}, ${cells.join(", ")}`);
      }
      const totals = found.map((p) => {
        let t = 0;
        for (let g = gw; g <= lastGw; g++) {
          const v = scorer.scoreForGw ? scorer.scoreForGw(p, g) : null;
          if (Number.isFinite(Number(v))) t += Number(v);
        }
        return t;
      });
      L.push(`    TOTAL, ${totals.map(n1).join(", ")}`);
      L.push(`    PRICE, ${found.map((p) => n1(p.price)).join(", ")}`);
      L.push(`    PER MILLION, ${found.map((p, i) => (Number(p.price) > 0 ? (totals[i] / Number(p.price)).toFixed(2) : "—")).join(", ")}`);
      L.push("");
      const bestIdx = totals.indexOf(Math.max(...totals));
      L.push(`  Highest total: ${found[bestIdx].web_name} at ${n1(totals[bestIdx])}.`);
      const ceilings = found.map((p) => { const b = scorer.bandOf ? scorer.bandOf(p) : null; return b && Number.isFinite(Number(b.p90)) ? Number(b.p90) : 0; });
      const bestCeil = ceilings.indexOf(Math.max(...ceilings));
      if (Math.max(...ceilings) > 0) {
        L.push(`  Highest ceiling: ${found[bestCeil].web_name} at ${n1(ceilings[bestCeil])} in a good week.`);
        if (bestCeil !== bestIdx) {
          L.push(`  Those differ. For a rank one push the ceiling matters more: finishing first needs players who`);
          L.push(`  can post fifteen, not players who reliably post five. Say which he is choosing and why.`);
        }
      }
      const perM = found.map((p, i) => (Number(p.price) > 0 ? totals[i] / Number(p.price) : 0));
      const bestVal = perM.indexOf(Math.max(...perM));
      L.push(`  Best per million: ${found[bestVal].web_name} at ${perM[bestVal].toFixed(2)}.`);
      if (bestIdx !== bestVal) {
        L.push(`  Those differ, so the choice depends on whether the money freed elsewhere is worth more than`);
        L.push(`  the points given up here. Say which, and why.`);
      }
      L.push("");
    }

    if (blanks.size || doubles.size) {
      L.push(`BLANKS AND DOUBLES IN THIS WINDOW`);
      for (let g = gw; g <= lastGw; g++) {
        const b = (blanks.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        const d = (doubles.get(g) || []).map((id) => teamById[id]?.short_name).filter(Boolean);
        if (b.length) L.push(`  GW${g} BLANK for ${b.join(" ")}`);
        if (d.length) L.push(`  GW${g} DOUBLE for ${d.join(" ")}`);
      }
      L.push("");
    }

    L.push(`A per gameweek figure moves with the opponent and with expected minutes, nothing else. It is not a`);
    L.push(`forecast of what will happen in that match, and it has never been checked against a played`);
    L.push(`gameweek. A gap under half a point between two players is not a real difference.`);

    return new Response(L.join("\n"), {
      status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(`The comparison could not be built: ${e.message}`, {
      status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
