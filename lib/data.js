"use client";
import { createClient } from "@supabase/supabase-js";

export const ARCHIVE_OFFSET = 1000000;

let client = null;
export function sb() {
  if (!client) {
    // Single instance app-wide. persistSession off: there is no login, and multiple clients
    // sharing one auth storage key is what produced the GoTrueClient console warning.
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function loadCore() {
  const supabase = sb();
  const [teamsRes, playersRes, gwsRes] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("players").select("*").not("archive", "is", true).order("selected_by_pct", { ascending: false }).limit(1000),
    supabase.from("gameweeks").select("gw, deadline_utc, finished").eq("finished", false).order("gw").limit(1),
  ]);
  if (teamsRes.error || playersRes.error || gwsRes.error) throw new Error("database unreachable");
  const teamById = Object.fromEntries((teamsRes.data || []).map((t) => [t.id, t]));
  const currentGw = gwsRes.data && gwsRes.data[0] ? gwsRes.data[0].gw : 1;
  // ARCHIVE_OFFSET marks rows written by the 2025/26 archive job. Those fixtures store only one
  // side of each match, so they must never reach a surface that resolves an opponent.
  const { data: fixtureRows, error: fe } = await supabase
    .from("fixtures").select("gw, home_team, away_team, kickoff_utc, fpl_id, season")
    .lt("fpl_id", ARCHIVE_OFFSET)
    .not("home_team", "is", null).not("away_team", "is", null)
    .gte("gw", currentGw).lte("gw", currentGw + 7).order("kickoff_utc");
  if (fe) throw new Error("database unreachable");
  const fixtures = fixtureRows || [];
  // Second gate at the read layer. A row with no current club, no position or no price is a data
  // fault, not a player: it is dropped and counted so the status surface can report it.
  const rejected = [];
  const players = (playersRes.data || [])
    .map((p) => ({
      ...p,
      team: teamById[p.team_id] ? teamById[p.team_id].short_name : "—",
      own: p.selected_by_pct === null ? 0 : Number(p.selected_by_pct),
      price: p.price === null ? 0 : Number(p.price),
    }))
    .filter((p) => {
      /* Do not discard an otherwise valid player merely because the players pull still carries his old or
         missing club. loadModel resolves the current team from the same projection generation the UI uses.
         Dropping him here made transferred players impossible to recover later and produced blank xPTS. */
      const ok = p.fpl_id !== null && p.fpl_id !== undefined && p.position && Number(p.price) > 0;
      if (!ok) rejected.push(p.web_name || p.fpl_id);
      return ok;
    });
  // The newest player row is the last time the pull ran. Freshness belongs on screen, not buried on
  // the Status page, because every number here is only as current as this timestamp.
  let updatedAt = null;
  for (const p of players) {
    const t = p.updated_at ? Date.parse(p.updated_at) : NaN;
    if (Number.isFinite(t) && (updatedAt === null || t > updatedAt)) updatedAt = t;
  }
  return { players, teamById, fixtures, currentGw, rejected, updatedAt };
}

export function nextFixtures(fixtures, teamById, teamId, n) {
  const out = [];
  for (const f of fixtures) {
    const oppId = f.home_team === teamId ? f.away_team : f.away_team === teamId ? f.home_team : null;
    if (oppId === null) continue;
    const opp = teamById[oppId];
    if (!opp) continue; // unresolvable club: skip rather than render a placeholder
    out.push({ opp: opp.short_name, oppId, home: f.home_team === teamId, gw: f.gw });
    if (out.length >= n) break;
  }
  return out;
}
export const fixLabel = (f) => (f.home ? `${f.opp} (H)` : `${f.opp.toLowerCase()} (A)`);

/* Most-owned legal 15 (2 GK · 5 DEF · 5 MID · 3 FWD by ownership) with a legal most-owned XI first. */
export const SQUAD_BUDGET = 100.0;

/* THE TEMPLATE — the legal fifteen with the highest total ownership that fits the budget.
 *
 * This is a constrained knapsack, not a greedy pick. Taking the most-owned player first and
 * skipping whatever no longer fits gives a squad that is affordable but not the best affordable
 * squad: one 15.5 forward can cost you three 40% defenders. So it is solved properly.
 *
 * Method, exact within the position quotas:
 *   1. Per position, dynamic programming over cost in 0.1 units: best[k][cost] = the highest total
 *      ownership achievable by taking exactly k players at exactly that cost, with back-pointers.
 *   2. Combine the four positions' cost curves under the total budget.
 *   3. Club limit of three is applied as a repair pass, because folding it into the DP would need a
 *      state per club count and is not worth the cost at this size. Each violation swaps the
 *      lowest-owned offender for the best legal player of the same position at no greater price.
 *
 * Ownership is the score being maximised, which is exactly what "the template" means: the squad the
 * field collectively owns. It is not a projection and is not claimed to be one.
 */
const UNIT = 10; // prices are in 0.1 steps, so work in integers
const NEED = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const CLUB_MAX = 3;

function bestForPosition(list, need, budgetUnits) {
  // dp[k] is an array over cost units; each entry is the best total ownership, or -1 if unreachable.
  const dp = [];
  const from = [];
  for (let k = 0; k <= need; k++) {
    dp.push(new Float64Array(budgetUnits + 1).fill(-1));
    from.push(new Int32Array(budgetUnits + 1).fill(-1));
  }
  dp[0][0] = 0;
  for (let i = 0; i < list.length; i++) {
    const cost = Math.round(Number(list[i].price) * UNIT);
    const own = Number(list[i].own) || 0;
    if (!Number.isFinite(cost) || cost <= 0) continue;
    for (let k = need - 1; k >= 0; k--) {
      const cur = dp[k], nxt = dp[k + 1], nf = from[k + 1];
      for (let c = budgetUnits - cost; c >= 0; c--) {
        if (cur[c] < 0) continue;
        const v = cur[c] + own;
        if (v > nxt[c + cost]) { nxt[c + cost] = v; nf[c + cost] = i * (need + 1) + k; }
      }
    }
  }
  // Best-so-far curve: at each cost, the best ownership using exactly `need` players at cost <= c.
  const curve = new Float64Array(budgetUnits + 1).fill(-1);
  const at = new Int32Array(budgetUnits + 1).fill(-1);
  let bestSoFar = -1, bestCost = -1;
  for (let c = 0; c <= budgetUnits; c++) {
    if (dp[need][c] > bestSoFar) { bestSoFar = dp[need][c]; bestCost = c; }
    curve[c] = bestSoFar; at[c] = bestCost;
  }
  const reconstruct = (cost) => {
    const out = [];
    let c = cost, k = need;
    while (k > 0 && c >= 0) {
      const enc = from[k][c];
      if (enc < 0) break;
      const i = Math.floor(enc / (need + 1));
      out.push(list[i]);
      c -= Math.round(Number(list[i].price) * UNIT);
      k -= 1;
    }
    return out;
  };
  return { curve, at, reconstruct };
}

export function templateSquad(players, budget = SQUAD_BUDGET) {
  const B = Math.round(budget * UNIT);
  const positions = ["GKP", "DEF", "MID", "FWD"];
  const pools = {};
  for (const pos of positions) {
    pools[pos] = players
      .filter((p) => p.position === pos && Number(p.price) > 0)
      .sort((a, b) => (Number(b.own) || 0) - (Number(a.own) || 0))
      .slice(0, 120); // 120 per position is far more than any template needs and keeps the DP quick
  }
  const solved = {};
  for (const pos of positions) solved[pos] = bestForPosition(pools[pos], NEED[pos], B);

  // Combine the four curves: choose how much of the budget each position gets.
  let combined = { curve: solved.GKP.curve, split: Array.from({ length: B + 1 }, (_, c) => [c]) };
  for (let n = 1; n < positions.length; n++) {
    const next = solved[positions[n]];
    const curve = new Float64Array(B + 1).fill(-1);
    const split = new Array(B + 1).fill(null);
    for (let total = 0; total <= B; total++) {
      let best = -1, bestAt = null;
      for (let a = 0; a <= total; a++) {
        const left = combined.curve[a], right = next.curve[total - a];
        if (left < 0 || right < 0) continue;
        const v = left + right;
        if (v > best) { best = v; bestAt = [a, total - a]; }
      }
      curve[total] = best;
      split[total] = bestAt;
    }
    combined = { curve, split, prev: combined, next, index: n };
  }

  if (combined.curve[B] < 0) return finishTemplate(improve(greedyFifteen(players, budget), players, budget), budget);

  // Walk the combination back out to per-position budgets.
  const budgets = {};
  let node = combined, total = B;
  const order = [];
  while (node.split && node.prev) {
    const [a, b] = node.split[total];
    order.unshift({ pos: positions[node.index], cost: b });
    total = a;
    node = node.prev;
  }
  budgets.GKP = total;
  for (const o of order) budgets[o.pos] = o.cost;

  let picked = [];
  for (const pos of positions) {
    const s = solved[pos];
    picked = picked.concat(s.reconstruct(s.at[budgets[pos]]));
  }
  if (picked.length !== 15) return finishTemplate(improve(greedyFifteen(players, budget), players, budget), budget);

  picked = repairClubLimit(picked, players);

  // The DP is exact within the position quotas but ignores the three-per-club limit, and the repair
  // pass can only lose ownership. So both routes are solved and improved, and the better wins.
  // This guarantees the result is never worse than the simpler method it replaced.
  const a = improve(picked, players, budget);
  const b = improve(greedyFifteen(players, budget), players, budget);
  const own = (xs) => xs.reduce((t, p) => t + (Number(p.own) || 0), 0);
  return finishTemplate(own(a) >= own(b) ? a : b, budget);
}

/* Local improvement: repeatedly take the single swap that raises total ownership most while keeping
   the squad legal and inside the budget. Stops when no swap helps. */
function improve(picked, players, budget) {
  let squad = picked.slice();
  for (let pass = 0; pass < 40; pass++) {
    const spend = squad.reduce((t, p) => t + Number(p.price), 0);
    const clubs = {};
    for (const p of squad) clubs[p.team] = (clubs[p.team] || 0) + 1;
    const ids = new Set(squad.map((p) => p.fpl_id));

    let best = null;
    for (let i = 0; i < squad.length; i++) {
      const out = squad[i];
      const headroom = budget - spend + Number(out.price);
      for (const inn of players) {
        if (inn.position !== out.position || ids.has(inn.fpl_id)) continue;
        if (Number(inn.price) > headroom + 1e-9) continue;
        const clubAfter = (clubs[inn.team] || 0) - (inn.team === out.team ? 1 : 0);
        if (clubAfter >= CLUB_MAX) continue;
        const gain = (Number(inn.own) || 0) - (Number(out.own) || 0);
        if (gain > 1e-9 && (!best || gain > best.gain)) best = { i, inn, gain };
      }
    }
    if (!best) break;
    squad[best.i] = best.inn;
  }
  return squad;
}

/* Ownership-order greedy that reserves enough budget to finish the squad legally. */
function greedyFifteen(players, budget) {
  const byOwn = players.slice().sort((a, b) => (b.own || 0) - (a.own || 0));
  const byPrice = players.slice().sort((a, b) => Number(a.price) - Number(b.price));
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubs = {};
  const picked = [];
  let spend = 0;
  const restCost = (extra) => {
    const c = { ...counts }, cl = { ...clubs };
    const used = new Set(picked.map((p) => p.fpl_id));
    if (extra) { c[extra.position] += 1; cl[extra.team] = (cl[extra.team] || 0) + 1; used.add(extra.fpl_id); }
    let total = 0;
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
      let want = NEED[pos] - c[pos];
      for (const p of byPrice) {
        if (want <= 0) break;
        if (p.position !== pos || used.has(p.fpl_id)) continue;
        if ((cl[p.team] || 0) >= CLUB_MAX) continue;
        total += Number(p.price); used.add(p.fpl_id); cl[p.team] = (cl[p.team] || 0) + 1; want -= 1;
      }
      if (want > 0) return Infinity;
    }
    return total;
  };
  for (const p of byOwn) {
    if (picked.length >= 15) break;
    if (counts[p.position] >= NEED[p.position]) continue;
    if ((clubs[p.team] || 0) >= CLUB_MAX) continue;
    if (spend + Number(p.price) + restCost(p) > budget + 1e-9) continue;
    picked.push(p); spend += Number(p.price);
    counts[p.position] += 1; clubs[p.team] = (clubs[p.team] || 0) + 1;
  }
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    for (const p of byPrice) {
      if (counts[pos] >= NEED[pos]) break;
      if (p.position !== pos || picked.some((x) => x.fpl_id === p.fpl_id)) continue;
      if ((clubs[p.team] || 0) >= CLUB_MAX) continue;
      picked.push(p); counts[pos] += 1; clubs[p.team] = (clubs[p.team] || 0) + 1;
    }
  }
  return picked;
}

/* Three-per-club repair. Swaps the lowest-owned offender for the best legal same-position player
   at no greater price, so the fix cannot break the budget. */
function repairClubLimit(picked, players) {
  const out = picked.slice();
  for (let guard = 0; guard < 30; guard++) {
    const counts = {};
    for (const p of out) counts[p.team] = (counts[p.team] || 0) + 1;
    const over = Object.entries(counts).find(([, n]) => n > CLUB_MAX);
    if (!over) break;
    const club = over[0];
    const offenders = out.filter((p) => p.team === club).sort((a, b) => (a.own || 0) - (b.own || 0));
    const drop = offenders[0];
    const ids = new Set(out.map((p) => p.fpl_id));
    const replacement = players
      .filter((p) => p.position === drop.position && !ids.has(p.fpl_id)
        && Number(p.price) <= Number(drop.price) && (counts[p.team] || 0) < CLUB_MAX)
      .sort((a, b) => (Number(b.own) || 0) - (Number(a.own) || 0))[0];
    if (!replacement) break;
    out[out.indexOf(drop)] = replacement;
  }
  return out;
}

/* Starting eleven from the fifteen: highest owned, respecting 1 GK, 3 DEF and 1 FWD minimums. */
function finishTemplate(picked, budget) {
  const gks = picked.filter((p) => p.position === "GKP").sort((a, b) => (b.own || 0) - (a.own || 0));
  const outfield = picked.filter((p) => p.position !== "GKP").sort((a, b) => (b.own || 0) - (a.own || 0));
  const xi = gks.slice(0, 1);
  const c = { DEF: 0, MID: 0, FWD: 0 };
  for (const p of outfield) {
    if (xi.length >= 11) break;
    const slotsLeft = 11 - xi.length;
    const reserved = (p.position === "DEF" ? 0 : Math.max(0, 3 - c.DEF))
                   + (p.position === "FWD" ? 0 : Math.max(0, 1 - c.FWD));
    if (slotsLeft - 1 < reserved) continue;
    xi.push(p); c[p.position] += 1;
  }
  const bench = picked.filter((p) => !xi.includes(p));
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
  xi.sort((a, b) => order[a.position] - order[b.position]);
  const fifteen = [...xi, ...bench].map((p) => ({ ...p, flag: p.status !== "a" }));
  fifteen.spend = Math.round(picked.reduce((a, p) => a + Number(p.price), 0) * 10) / 10;
  fifteen.budget = budget;
  fifteen.totalOwn = Math.round(picked.reduce((a, p) => a + (Number(p.own) || 0), 0) * 10) / 10;
  return fifteen;
}

/* Fixture swings v1 — INTERIM: FPL team strength until odds-implied lands. */
export function fixtureSwings(fixtures, teamById, currentGw) {
  const teams = Object.values(teamById);
  if (!teams.length || teams[0].strength === undefined || teams[0].strength === null) return null;
  const runs = teams.map((t) => {
    const next = [];
    for (const f of fixtures) {
      if (next.length >= 5) break;
      const oppId = f.home_team === t.id ? f.away_team : f.away_team === t.id ? f.home_team : null;
      if (oppId === null) continue;
      const opp = teamById[oppId];
      if (!opp || opp.strength === null || opp.strength === undefined) continue;
      next.push({ opp, home: f.home_team === t.id });
    }
    if (next.length < 3) return null;
    const avg = next.reduce((s, x) => s + Number(x.opp.strength), 0) / next.length;
    return { team: t.short_name, avg, next: next.map((x) => ({ opp: x.opp.short_name, home: x.home })) };
  }).filter(Boolean).sort((a, b) => a.avg - b.avg);
  return { easing: runs.slice(0, 3), brutal: runs.slice(-3).reverse() };
}


/* BLANK AND DOUBLE GAMEWEEKS, read straight off the fixture list: count fixtures per club per
   gameweek. A club on zero blanks; a club on two or more doubles. No prediction involved, so this is
   exact for every gameweek the FPL API has published. */
export function blanksAndDoubles(fixtures, teamIds, { fromGw = 1 } = {}) {
  const counts = new Map(); // gw -> Map(teamId -> n)
  for (const f of fixtures || []) {
    if (f.gw === null || f.gw === undefined || f.gw < fromGw) continue;
    const m = counts.get(f.gw) || new Map();
    for (const t of [f.home_team, f.away_team]) if (t) m.set(t, (m.get(t) || 0) + 1);
    counts.set(f.gw, m);
  }
  const out = [];
  for (const gw of [...counts.keys()].sort((a, b) => a - b)) {
    const m = counts.get(gw);
    const doubles = [...m.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
    const blanks = (teamIds || []).filter((t) => !m.has(t));
    if (doubles.length || blanks.length) out.push({ gw, doubles, blanks });
  }
  return out;
}
