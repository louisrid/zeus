#!/usr/bin/env node
/* Deterministic xPTS whole-table audit.
 *
 * Usage:
 *   node jobs/xpts_audit.mjs /path/to/supabase-export.csv
 *   node jobs/xpts_audit.mjs /path/to/export.csv --out-dir /tmp/zeus-audit
 *
 * No database and no npm packages are required. Run this after every projection change so named-player
 * improvements cannot hide team-level or whole-table regressions.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseCsv(text) {
  const raw = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") raw.push(row);
      row = [];
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); raw.push(row); }
  const header = raw.shift() || [];
  return raw.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const n = (v, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const round = (v, dp = 3) => Number(n(v).toFixed(dp));
const upper = (v) => String(v ?? "").toUpperCase();
const lower = (v) => String(v ?? "").toLowerCase();

const WATCH = [
  ["Haaland", "MCI"], ["Watkins", "AVL"], ["Palmer", "CHE"], ["Neto", "CHE"],
  ["Caicedo", "CHE"], ["Saka", "ARS"], ["Rice", "ARS"], ["Virgil", "LIV"],
  ["A.Becker", "LIV"], ["Alisson", "LIV"], ["Matheus N.", "MCI"],
  ["Matheus Nunes", "MCI"], ["Gabriel", "ARS"],
];
const PAIRS = [
  [["Haaland", "MCI"], ["Watkins", "AVL"]],
  [["Palmer", "CHE"], ["Neto", "CHE"]],
  [["Palmer", "CHE"], ["Caicedo", "CHE"]],
  [["Saka", "ARS"], ["Rice", "ARS"]],
];

export function findPlayer(rows, name, team) {
  const pool = rows.filter((r) => !team || upper(r.team) === upper(team));
  const exact = pool.find((r) => lower(r.web_name) === lower(name));
  if (exact) return exact;
  return pool.find((r) => lower(r.web_name).includes(lower(name)));
}

function groupBy(rows, key) {
  const out = new Map();
  for (const r of rows) {
    const k = r[key] || "UNKNOWN";
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

function pick(row) {
  const fields = [
    "team", "position", "price", "xpts", "expected_minutes", "start_probability",
    "cameo_probability", "probability_60_minutes", "minutes_source", "rate_source",
    "used_npxg90", "used_xa90", "goal_share", "assist_share", "e_goals", "e_assists", "e_bonus", "e_defcon",
    "p_cs", "historical_nineties",
  ];
  return Object.fromEntries(fields.map((k) => [k, row[k] === "" ? null : row[k]]));
}

export function auditRows(rows, sourceCsv = "projection-export.csv") {
  const required = ["web_name", "team", "position", "xpts", "expected_minutes", "start_probability"];
  const missing = required.filter((k) => !Object.hasOwn(rows[0] || {}, k));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);

  const report = {
    source_csv: basename(sourceCsv), rows: rows.length, checks: {}, watch_players: {},
    comparisons: {}, team_summary: [], top_xpts: [], high_xpts_low_minutes: [],
    low_xpts_high_minutes: [],
  };

  for (const [team, teamRows] of groupBy(rows, "team")) {
    const startSum = teamRows.reduce((s, r) => s + n(r.start_probability), 0);
    const gkStart = teamRows.filter((r) => upper(r.position) === "GKP")
      .reduce((s, r) => s + n(r.start_probability), 0);
    const minuteSum = teamRows.reduce((s, r) => s + n(r.expected_minutes), 0);
    report.team_summary.push({
      team, start_sum: round(startSum, 4), gk_start_sum: round(gkStart, 4),
      expected_minutes_sum: round(minuteSum, 2), players: teamRows.length,
    });
  }
  report.team_summary.sort((a, b) => String(a.team).localeCompare(String(b.team)));

  const startFailures = report.team_summary.filter((x) => Math.abs(x.start_sum - 11) > 0.01);
  const gkFailures = report.team_summary.filter((x) => Math.abs(x.gk_start_sum - 1) > 0.01);
  const minuteFailures = report.team_summary.filter((x) => Math.abs(x.expected_minutes_sum - 990) > 5);
  report.checks.teams_start_sum_11 = {
    pass: startFailures.length === 0,
    min: Math.min(...report.team_summary.map((x) => x.start_sum)),
    max: Math.max(...report.team_summary.map((x) => x.start_sum)), failures: startFailures,
  };
  report.checks.teams_gk_sum_1 = {
    pass: gkFailures.length === 0,
    min: Math.min(...report.team_summary.map((x) => x.gk_start_sum)),
    max: Math.max(...report.team_summary.map((x) => x.gk_start_sum)), failures: gkFailures,
  };
  report.checks.team_minutes_990 = {
    pass: minuteFailures.length === 0,
    min: Math.min(...report.team_summary.map((x) => x.expected_minutes_sum)),
    max: Math.max(...report.team_summary.map((x) => x.expected_minutes_sum)),
    mean: round(report.team_summary.reduce((s, x) => s + x.expected_minutes_sum, 0) / report.team_summary.length, 2),
    failures: minuteFailures,
  };

  const unavailable = rows.filter((r) => ["i", "s", "u", "n"].includes(lower(r.status)));
  const badUnavailable = unavailable.filter((r) => n(r.expected_minutes) > 0.01 || n(r.xpts) > 0.01);
  report.checks.unavailable_zero = {
    pass: badUnavailable.length === 0, count: unavailable.length,
    failures: badUnavailable.map((r) => ({
      web_name: r.web_name, team: r.team, status: r.status,
      expected_minutes: n(r.expected_minutes), xpts: n(r.xpts),
    })),
  };

  const prior = rows.filter((r) => lower(r.rate_source).includes("prior"));
  const establishedPrior = prior.filter((r) => n(r.historical_nineties) >= 20);
  report.checks.positional_prior_usage = {
    total: prior.length, pct: round(100 * prior.length / Math.max(rows.length, 1), 1),
    established_20plus: establishedPrior.length,
    examples: establishedPrior.sort((a, b) => n(b.historical_nineties) - n(a.historical_nineties))
      .slice(0, 20).map((r) => ({
        web_name: r.web_name, team: r.team, position: r.position,
        historical_nineties: n(r.historical_nineties), used_npxg90: n(r.used_npxg90),
        used_xa90: n(r.used_xa90), xpts: n(r.xpts),
      })),
  };


  /* A broad prior must never be zero for an outfield player. Zero-rate templates were the exact mechanism
     behind promoted-club defenders absorbing nearly the whole attack: every unmeasured teammate contributed
     zero to the denominator, so one matched centre-back received 30%+ of team goals. */
  const zeroPriorRates = rows.filter((r) =>
    upper(r.position) !== "GKP"
    && lower(r.rate_source).includes("prior")
    && (n(r.used_npxg90) <= 0 || n(r.used_xa90) <= 0)
  );
  report.checks.nonzero_outfield_priors = {
    pass: zeroPriorRates.length === 0,
    failures: zeroPriorRates.slice(0, 100).map((r) => ({
      web_name: r.web_name, team: r.team, position: r.position,
      rate_source: r.rate_source, used_npxg90: n(r.used_npxg90), used_xa90: n(r.used_xa90),
    })),
  };

  /* A defender receiving more than a quarter of a team's scoring weight or over 0.40 expected goals is
     almost always evidence that teammates are missing usable rates, not a real football forecast. Keep this
     as a structural concentration gate rather than naming or manually downgrading any player. */
  const defenderConcentration = rows.filter((r) => upper(r.position) === "DEF" && (
    n(r.goal_share) > 0.25 || n(r.e_goals) > 0.40
  ));
  report.checks.defender_attack_concentration = {
    pass: defenderConcentration.length === 0,
    failures: defenderConcentration.slice(0, 100).map((r) => ({
      web_name: r.web_name, team: r.team, goal_share: n(r.goal_share),
      e_goals: n(r.e_goals), expected_minutes: n(r.expected_minutes), rate_source: r.rate_source,
    })),
  };

  const roleAware = rows.filter((r) => lower(r.rate_source).includes("|role:"));
  report.checks.role_aware_rates = {
    total: roleAware.length,
    pct: round(100 * roleAware.length / Math.max(rows.length, 1), 1),
    examples: roleAware.slice(0, 20).map((r) => ({
      web_name: r.web_name, team: r.team, rate_source: r.rate_source,
      used_npxg90: n(r.used_npxg90), used_xa90: n(r.used_xa90),
    })),
  };

  const starters = rows.filter((r) => r.minutes_source === "lineup-starter");
  const nonNamed = rows.filter((r) => r.minutes_source === "lineup-notNamed");
  const unlocked = starters.filter((r) => Math.abs(n(r.start_probability, -1) - 1) > 0.001);
  const nonZero = nonNamed.filter((r) => Math.abs(n(r.start_probability, -1)) > 0.001);
  report.checks.gw1_lineup_starters_locked = {
    pass: starters.length > 0 && unlocked.length === 0, count: starters.length,
    not_locked: unlocked.map((r) => ({
      web_name: r.web_name, team: r.team, start_probability: n(r.start_probability),
      expected_minutes: n(r.expected_minutes),
    })),
  };
  report.checks.gw1_nonstarters_zero_start = {
    pass: nonNamed.length > 0 && nonZero.length === 0, count: nonNamed.length,
    not_zero: nonZero.slice(0, 100).map((r) => ({
      web_name: r.web_name, team: r.team, start_probability: n(r.start_probability),
      cameo_probability: n(r.cameo_probability), expected_minutes: n(r.expected_minutes),
    })),
  };

  const used = new Set();
  for (const [name, team] of WATCH) {
    const r = findPlayer(rows, name, team);
    if (!r || used.has(r.web_name)) continue;
    used.add(r.web_name);
    report.watch_players[r.web_name] = pick(r);
  }

  for (const [[a, at], [b, bt]] of PAIRS) {
    const A = findPlayer(rows, a, at), B = findPlayer(rows, b, bt);
    if (!A || !B) continue;
    report.comparisons[`${A.web_name} vs ${B.web_name}`] = {
      a_xpts: n(A.xpts), b_xpts: n(B.xpts), gap: round(n(A.xpts) - n(B.xpts)),
      a_minutes: n(A.expected_minutes), b_minutes: n(B.expected_minutes),
      a_xg_xa: round(n(A.e_goals) + n(A.e_assists)),
      b_xg_xa: round(n(B.e_goals) + n(B.e_assists)),
      a_bonus: n(A.e_bonus), b_bonus: n(B.e_bonus),
      a_defcon: n(A.e_defcon), b_defcon: n(B.e_defcon),
    };
  }

  const byXpts = [...rows].sort((a, b) => n(b.xpts) - n(a.xpts));
  report.top_xpts = byXpts.slice(0, 25).map((r) => pick({ ...r, team: r.team, position: r.position, price: r.price }));
  report.high_xpts_low_minutes = byXpts.filter((r) => n(r.expected_minutes) < 35 && n(r.xpts) >= 3.5)
    .map((r) => ({ web_name: r.web_name, team: r.team, position: r.position, xpts: n(r.xpts), expected_minutes: n(r.expected_minutes) }));
  report.low_xpts_high_minutes = [...rows].filter((r) => n(r.expected_minutes) >= 70 && n(r.xpts) < 2.2)
    .sort((a, b) => n(a.xpts) - n(b.xpts))
    .map((r) => ({ web_name: r.web_name, team: r.team, position: r.position, xpts: n(r.xpts), expected_minutes: n(r.expected_minutes) }));
  return report;
}

export function renderMarkdown(report) {
  const pass = (v) => v ? "PASS" : "FAIL";
  const lines = [
    "# ZEUS xPTS Automated Audit", "", `Source: \`${report.source_csv}\``, `Rows: ${report.rows}`, "",
    "## Structural gates", "",
    `- **${pass(report.checks.teams_start_sum_11.pass)}:** Team starts sum to 11`,
    `- **${pass(report.checks.teams_gk_sum_1.pass)}:** Goalkeeper starts sum to 1`,
    `- **${pass(report.checks.team_minutes_990.pass)}:** Team expected minutes sum to 990 ±5`,
    `- **${pass(report.checks.unavailable_zero.pass)}:** Unavailable players are zero`,
    `- **${pass(report.checks.gw1_lineup_starters_locked.pass)}:** GW1 named starters have 100% start chance`,
    `- **${pass(report.checks.gw1_nonstarters_zero_start.pass)}:** GW1 non-starters have 0% start chance`,
    `- **${pass(report.checks.nonzero_outfield_priors.pass)}:** Outfield positional priors are non-zero`,
    `- **${pass(report.checks.defender_attack_concentration.pass)}:** No defender absorbs an implausible share of team goals`,
    "", "## Data coverage", "",
    `- Positional-prior players: **${report.checks.positional_prior_usage.total} / ${report.rows} (${report.checks.positional_prior_usage.pct}%)**`,
    `- Established players with 20+ historical nineties still on priors: **${report.checks.positional_prior_usage.established_20plus}**`,
    `- Players using a derived role-aware rate target: **${report.checks.role_aware_rates.total} / ${report.rows} (${report.checks.role_aware_rates.pct}%)**`,
    "", "## Watch players", "",
    "| Player | Team | xPTS | xMins | P(start) | Route | Rate source | xG | xA | Bonus | DEFCON |",
    "|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|",
  ];
  for (const [name, x] of Object.entries(report.watch_players)) {
    lines.push(`| ${name} | ${x.team} | ${n(x.xpts).toFixed(3)} | ${n(x.expected_minutes).toFixed(1)} | ${n(x.start_probability).toFixed(3)} | ${x.minutes_source} | ${x.rate_source} | ${n(x.e_goals).toFixed(3)} | ${n(x.e_assists).toFixed(3)} | ${n(x.e_bonus).toFixed(3)} | ${n(x.e_defcon).toFixed(3)} |`);
  }
  lines.push("", "## Key comparisons", "");
  for (const [name, x] of Object.entries(report.comparisons)) {
    lines.push(`- **${name}:** gap ${x.gap >= 0 ? "+" : ""}${x.gap.toFixed(3)} xPTS; xG+xA ${x.a_xg_xa.toFixed(3)} vs ${x.b_xg_xa.toFixed(3)}; minutes ${x.a_minutes.toFixed(1)} vs ${x.b_minutes.toFixed(1)}`);
  }
  lines.push("", "## Current failure counts", "",
    `- High xPTS with under 35 minutes: **${report.high_xpts_low_minutes.length}**`,
    `- Under 2.2 xPTS with 70+ minutes: **${report.low_xpts_high_minutes.length}**`, "",
    "This report is generated after every projection change. A change is not accepted only because selected players look better; structural gates and whole-table comparisons must also improve.", "");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const csv = args.find((x) => !x.startsWith("--")) || process.env.CSV;
  if (!csv) throw new Error("Usage: node jobs/xpts_audit.mjs <projection-export.csv> [--out-dir DIR]");
  const outFlag = args.indexOf("--out-dir");
  const outDir = resolve(outFlag >= 0 ? args[outFlag + 1] : process.env.OUT_DIR || "./xpts-audit");
  mkdirSync(outDir, { recursive: true });
  const rows = parseCsv(readFileSync(csv, "utf8"));
  const report = auditRows(rows, csv);
  const jsonPath = join(outDir, "xpts_audit.json");
  const mdPath = join(outDir, "xpts_audit.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ json: jsonPath, markdown: mdPath, checks: Object.fromEntries(
    Object.entries(report.checks).map(([k, v]) => [k, v.pass ?? null])
  ) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
