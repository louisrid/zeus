/* DERIVING LAST SEASON'S SCORING RULES FROM THE DATA.
 *
 * Louis's design was a version B on last season's rules, tuned until it predicted last season accurately, and
 * a version A that inherits that tuning with this season's rule values swapped in. I built the backtest to
 * score last season's actual points using THIS season's rules, which is version A validating against version
 * B's data. Wrong, and it quietly biases every result.
 *
 * The fix is not to type last season's values from memory. The archive already contains, for every player and
 * gameweek, the counted events AND the total points those events produced. So the point values can be SOLVED
 * FOR: find the numbers that best explain actual totals from actual events. Least squares, one position at a
 * time, because a goal is worth a different amount to a defender than to a forward.
 *
 * If the derived values come out at the values the game publishes, the archive is internally consistent and
 * the method is sound. If they do not, the archive is wrong and every projection built on it inherits that,
 * which is worth knowing before tuning anything else.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional SEASON.
 */
import { createClient } from "@supabase/supabase-js";

/* ALL seasons by default, because the rules changed over the years and a model tuned across them has to price
   each season as that season actually scored. Pass SEASON to do just one. */
const SEASON_INPUT = (process.env.SEASON || "").trim();

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function all(client, table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/* Least squares by Gaussian elimination. Small and dense, so nothing cleverer is warranted. */
function solve(A, b) {
  const n = A[0].length;
  /* Normal equations: (AtA)x = Atb. */
  const AtA = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      Atb[i] += A[r][i] * b[r];
      for (let j = 0; j < n; j++) AtA[i][j] += A[r][i] * A[r][j];
    }
  }
  /* A tiny ridge term, so a feature that never varies cannot make the matrix singular. */
  for (let i = 0; i < n; i++) AtA[i][i] += 1e-6;

  const M = AtA.map((row, i) => [...row, Atb[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");

async function main() {
  const client = db();
  console.log(`Deriving the scoring rules each season actually used, solved for rather than typed.`);

  const cols = "season, gw, element, position, minutes, started, total_points, goals, assists, "
    + "clean_sheets, goals_conceded, saves, yellow, red, own_goals, pens_missed, pens_saved, bonus, defcon";
  const allRows = await all(client, "history_player_gw", cols, (q) => q.eq("competition", "PL"));
  if (!allRows.length) throw new Error("history_player_gw is empty.");

  const seasons = [...new Set(allRows.map((r) => r.season))].sort();
  const wanted = SEASON_INPUT
    ? seasons.filter((x) => x === SEASON_INPUT || x === SEASON_INPUT.replace("/", "-") || x === SEASON_INPUT.replace("-", "/"))
    : seasons;
  if (!wanted.length) throw new Error(`No season matched ${SEASON_INPUT}. The table holds: ${seasons.join(", ")}.`);
  console.log(`${allRows.length} rows across ${seasons.length} seasons: ${seasons.join(", ")}.`);
  console.log(`Deriving for: ${wanted.join(", ")}.\n`);

  const derived = {};
  for (const season of wanted) {
    const rows = allRows.filter((r) => r.season === season);
    console.log(`──────── ${season}, ${rows.length} rows ────────`);
    derived[season] = deriveOne(rows, season);
    console.log("");
  }

  /* One file the backtest reads, so nothing is typed by hand. */
  console.log(`DERIVED RULES AS JSON — paste this into config/rules-by-season.json`);
  console.log(JSON.stringify({
    _what: "Scoring rules per season, solved for from history_player_gw by jobs/derive_rules.mjs. Not typed.",
    _derived_on: new Date().toISOString().slice(0, 10),
    seasons: derived,
  }, null, 2));
  return;
}

/* Solve one season. Returns the rounded values plus how well they fit, so a season whose data is inconsistent
   can be spotted and excluded rather than quietly poisoning a tune. */
function deriveOne(rows, season) {

  /* The features. Bonus is a counted award rather than a rule with a value, so it is subtracted from the
     target rather than fitted: fitting it would just return 1 and absorb error from everything else. */
  const feature = (r) => {
    const mins = Number(r.minutes) || 0;
    const played60 = mins >= 60 ? 1 : 0;
    const playedUnder60 = mins > 0 && mins < 60 ? 1 : 0;
    return [
      playedUnder60,                                  // appearance under an hour
      played60,                                       // appearance of an hour or more
      Number(r.goals) || 0,
      Number(r.assists) || 0,
      Number(r.clean_sheets) || 0,
      Math.floor((Number(r.goals_conceded) || 0) / 2),
      Math.floor((Number(r.saves) || 0) / 3),
      Number(r.yellow) || 0,
      Number(r.red) || 0,
      Number(r.own_goals) || 0,
      Number(r.pens_missed) || 0,
      Number(r.pens_saved) || 0,
      /* DefCon is awarded ONCE at a threshold, and the archive column is a raw count of the actions, not a
         flag. Treating each action as worth points fitted it at 0.17 for defenders, and 0.17 times a dozen
         tackles is about two points, so it quietly absorbed the appearance points and dragged them from 2.00
         down to 1.25. The threshold is lower for defenders than for everyone else. */
      (Number(r.defcon) || 0) >= (r.position === "DEF" ? 10 : 12) ? 1 : 0,
    ];
  };
  const NAMES = [
    "appearance under 60", "appearance 60 plus", "goal", "assist", "clean sheet",
    "per 2 conceded", "per 3 saves", "yellow", "red", "own goal",
    "penalty missed", "penalty saved", "defensive contribution",
  ];

  const out = { fit: {}, values: {} };
  const KEYS = ["appearance_under_60", "appearance_60_plus", "goal", "assist", "clean_sheet",
    "conceded_per_2", "saves_per_3", "yellow", "red", "own_goal",
    "penalty_missed", "penalty_saved", "defensive_contribution"];

  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    const set = rows.filter((r) => r.position === pos && Number(r.minutes) > 0);
    if (set.length < 50) { console.log(`${pos}: only ${set.length} rows, too few to solve.`); continue; }

    const A = set.map(feature);
    /* Bonus is removed from the target so the fitted values describe the rules, not the bonus race. */
    const b = set.map((r) => (Number(r.total_points) || 0) - (Number(r.bonus) || 0));
    overall.A.push(...A); overall.b.push(...b);

    const x = solve(A, b);
    /* How well the derived rules explain the data. A near-perfect fit means the archive is internally
       consistent and these ARE the rules. A poor fit means the archive is wrong somewhere. */
    const pred = A.map((row) => row.reduce((s, v, i) => s + v * x[i], 0));
    const resid = pred.map((p, i) => p - b[i]);
    const mae = resid.reduce((s, e) => s + Math.abs(e), 0) / resid.length;
    const exact = resid.filter((e) => Math.abs(e) < 0.05).length / resid.length;

    console.log(`${pos}  ${set.length} rows, fit MAE ${n2(mae)}, exact on ${(exact * 100).toFixed(1)}% of rows`);
    out.fit[pos] = { rows: set.length, mae: +mae.toFixed(3), exact: +(exact * 100).toFixed(1) };
    out.values[pos] = {};
    for (let i = 0; i < NAMES.length; i++) {
      /* Only report a value the data could actually determine. A rule the season never triggered cannot be
         solved for, and reporting a zero would be a lie about what the season did. */
      const used = A.reduce((s, row) => s + (row[i] !== 0 ? 1 : 0), 0);
      if (used < 10) continue;
      /* FPL point values are whole numbers, so a fit of 3.98 is a 4. Rounding here is what makes the derived
         values usable rather than merely indicative, and the fit MAE above says whether rounding is safe. */
      const rounded = Math.round(x[i]);
      const off = Math.abs(x[i] - rounded);
      out.values[pos][KEYS[i]] = { value: rounded, fitted: +x[i].toFixed(3), seen_in_rows: used };
      console.log(`    ${NAMES[i].padEnd(24)} ${n2(x[i]).padStart(7)} -> ${String(rounded).padStart(3)}   seen in ${used} rows${off > 0.15 ? "   POOR FIT, do not trust" : ""}`);
    }
    console.log("");
  }
  return out;
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Rule derivation failed: ${e.message}`); process.exit(1); });
}

export { main as deriveRules, solve };
