#!/usr/bin/env node
/* Live xPTS release gate.
 * Reads the automatically exported current generation, runs the whole-table audit, compares it with the
 * frozen pre-repair baseline and refuses to call the release accepted when structural or obvious football
 * contradictions remain. Player checks are regression gates only; none of these values feeds the model.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditRows, findPlayer, parseCsv, renderMarkdown } from "./xpts_audit.mjs";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const rounded = (value, digits = 3) => Number(num(value).toFixed(digits));
const upper = (value) => String(value ?? "").toUpperCase();
const lower = (value) => String(value ?? "").toLowerCase();

function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows) {
    const value = row[key] || "UNKNOWN";
    const group = out.get(value) || [];
    group.push(row);
    out.set(value, group);
  }
  return out;
}

function gate(name, pass, detail, severity = "critical") {
  return { name, pass: Boolean(pass), detail, severity };
}

function playerSummary(row) {
  if (!row) return null;
  return {
    web_name: row.web_name,
    team: row.team,
    xpts: rounded(row.xpts),
    expected_minutes: rounded(row.expected_minutes, 1),
    start_probability: rounded(row.start_probability, 3),
    e_goals: rounded(row.e_goals),
    e_pen_goals: rounded(row.e_pen_goals),
    e_assists: rounded(row.e_assists),
    e_bonus: rounded(row.e_bonus),
    e_defcon: rounded(row.e_defcon),
    p_cs: rounded(row.p_cs),
    lambda_team: rounded(row.lambda_team),
    lambda_opponent: rounded(row.lambda_opponent),
    rate_source: row.rate_source,
    minutes_source: row.minutes_source,
    historical_nineties: rounded(row.historical_nineties, 2),
    used_npxg90: rounded(row.used_npxg90, 3),
    used_xa90: rounded(row.used_xa90, 3),
  };
}

function playerKey(row) {
  return row ? `${row.web_name}|${row.team}` : null;
}

export function evaluateRelease(rows, baseline = {}) {
  const audit = auditRows(rows, "live-projections.csv");
  const gates = [];

  gates.push(gate("Every team has 11 expected starters", audit.checks.teams_start_sum_11.pass,
    `${audit.checks.teams_start_sum_11.min} to ${audit.checks.teams_start_sum_11.max}`));
  gates.push(gate("Every team has one expected starting goalkeeper", audit.checks.teams_gk_sum_1.pass,
    `${audit.checks.teams_gk_sum_1.min} to ${audit.checks.teams_gk_sum_1.max}`));
  gates.push(gate("Every team reconciles to 990 expected minutes", audit.checks.team_minutes_990.pass,
    `${audit.checks.team_minutes_990.min} to ${audit.checks.team_minutes_990.max}, mean ${audit.checks.team_minutes_990.mean}`));
  gates.push(gate("Unavailable players receive zero", audit.checks.unavailable_zero.pass,
    `${audit.checks.unavailable_zero.failures.length} failures`));
  gates.push(gate("GW1 predicted starters are locked at 100%", audit.checks.gw1_lineup_starters_locked.pass,
    `${audit.checks.gw1_lineup_starters_locked.count} starters, ${audit.checks.gw1_lineup_starters_locked.not_locked.length} failures`));
  gates.push(gate("GW1 non-starters have zero start probability", audit.checks.gw1_nonstarters_zero_start.pass,
    `${audit.checks.gw1_nonstarters_zero_start.count} non-starters, ${audit.checks.gw1_nonstarters_zero_start.not_zero.length} failures`));
  gates.push(gate("Outfield fallback priors are non-zero", audit.checks.nonzero_outfield_priors.pass,
    `${audit.checks.nonzero_outfield_priors.failures.length} zero-rate templates`));
  gates.push(gate("No defender absorbs an implausible share of team attack", audit.checks.defender_attack_concentration.pass,
    `${audit.checks.defender_attack_concentration.failures.length} concentration failures`));

  const hasRouteColumn = Object.hasOwn(rows[0] || {}, "projection_route");
  const missingEngine = rows.filter((row) => (hasRouteColumn && row.projection_route !== "engine") || row.xpts === "");
  gates.push(gate("Every active player has an engine projection", missingEngine.length === 0,
    `${missingEngine.length} missing engine rows`));

  const establishedPrior = audit.checks.positional_prior_usage.established_20plus;
  gates.push(gate("Established players no longer fall onto broad positional priors", establishedPrior === 0,
    `${establishedPrior} players with 20+ historical nineties remain on a broad prior`));

  gates.push(gate("No starter-level xPTS is assigned below 35 minutes", audit.high_xpts_low_minutes.length === 0,
    `${audit.high_xpts_low_minutes.length} players at 3.5+ xPTS below 35 minutes`));

  const collapsedNamedStarters = rows.filter((row) =>
    ["lineup-starter", "lineup-replacement"].includes(String(row.minutes_source || ""))
    && num(row.start_probability) >= 0.999
    && num(row.expected_minutes) < 55
    && lower(row.status) !== "i"
    && lower(row.status) !== "s"
    && lower(row.status) !== "u"
  );
  gates.push(gate("Predicted starters do not inherit collapsed conditional minutes", collapsedNamedStarters.length === 0,
    `${collapsedNamedStarters.length} 100% starters below 55 expected minutes`));

  /* historical_nineties is the Premier League baseline column, not necessarily the sample that resolved
     the attacking rate. Promoted players can legitimately have a blank PL baseline while carrying a large
     archive/Understat sample, and every goalkeeper has the structural role "goalkeeper". The old gate
     treated blank as zero and therefore rejected 64 valid rows even though attachPlayerRole had already
     removed aggressive outfield roles below the configured sample floor. Only a known, numeric, outfield
     sample below ten can prove the feedback loop this gate is meant to catch. */
  const lowSampleRoleLoops = rows.filter((row) => {
    const rawNineties = String(row.historical_nineties ?? "").trim();
    if (!rawNineties || upper(row.position) === "GKP") return false;
    const nineties = Number(rawNineties);
    return Number.isFinite(nineties)
      && nineties < 10
      && /\|role:/.test(String(row.rate_source || ""));
  });
  gates.push(gate("Low-sample players cannot reinforce themselves through aggressive role priors", lowSampleRoleLoops.length === 0,
    lowSampleRoleLoops.length
      ? `${lowSampleRoleLoops.length} known low-sample outfield players still use a role-specific rate: ${lowSampleRoleLoops.slice(0, 12).map((row) => `${row.web_name} ${row.team} (${rounded(row.historical_nineties, 2)} 90s, ${row.rate_source})`).join(" | ")}`
      : "0 known low-sample outfield players use a role-specific rate"));

  const premiumDefenderOutliers = rows.filter((row) => upper(row.position) === "DEF" && num(row.xpts) > 7.25);
  gates.push(gate("Premium defender projections require calibration review", premiumDefenderOutliers.length === 0,
    premiumDefenderOutliers.length
      ? premiumDefenderOutliers.slice(0, 8).map((row) =>
        `${row.web_name} ${row.team} ${rounded(row.xpts)} xPTS; team lambda ${rounded(row.lambda_team)}, opponent ${rounded(row.lambda_opponent)}, CS ${(100 * num(row.p_cs)).toFixed(1)}%, xG ${rounded(row.e_goals)}, xA ${rounded(row.e_assists)}, bonus ${rounded(row.e_bonus)}, DEFCON ${rounded(row.e_defcon)}`
      ).join(" | ")
      : "0 defenders above 7.25 xPTS", "warning"));

  const lowSampleShortStarters = rows.filter((row) =>
    ["lineup-starter", "lineup-replacement"].includes(String(row.minutes_source || ""))
    && num(row.start_probability) >= 0.999
    && num(row.historical_nineties, Infinity) < 10
    && num(row.expected_minutes) < 65
  );
  gates.push(gate("Low-sample predicted starters below 65 minutes require review", lowSampleShortStarters.length === 0,
    lowSampleShortStarters.length
      ? lowSampleShortStarters.slice(0, 12).map((row) => `${row.web_name} ${row.team} ${rounded(row.expected_minutes, 1)} minutes`).join(", ")
      : "0 low-sample predicted starters below 65 minutes", "warning"));

  const lowSamplePremiums = rows.filter((row) =>
    num(row.historical_nineties, Infinity) < 10
    && num(row.xpts) > 4.75
  );
  gates.push(gate("Low-sample premium projections require review", lowSamplePremiums.length === 0,
    lowSamplePremiums.length
      ? lowSamplePremiums.slice(0, 12).map((row) => `${row.web_name} ${row.team} ${rounded(row.xpts)} xPTS, ${rounded(row.expected_minutes, 1)} minutes, ${rounded(row.used_npxg90)} npxG90, ${row.rate_source || "unknown rate"}`).join(" | ")
      : "0 players below 10 historical nineties above 4.75 xPTS", "warning"));

  const probabilityFailures = rows.filter((row) => {
    const start = num(row.start_probability);
    const cameo = num(row.cameo_probability);
    const appearance = start + cameo;
    return start < -0.001 || cameo < -0.001 || appearance > 1.001
      || num(row.p_goal) > appearance + 0.02
      || num(row.p_assist) > appearance + 0.02
      || num(row.p_cs) > num(row.probability_60_minutes) + 0.02;
  });
  gates.push(gate("Player probabilities are internally coherent", probabilityFailures.length === 0,
    `${probabilityFailures.length} probability failures`));

  /* A player with a tiny but non-zero cameo probability has tiny but non-zero expected minutes and points.
     The old <= 0.01 threshold called 0.00987 minutes "zero" and blocked a coherent 0.011 xPTS row. Reserve
     this invariant for genuinely zero exposure; the separate probability checks still catch impossible
     event probabilities. */
  const ZERO_MINUTES_EPSILON = 1e-6;
  const EVENT_EPSILON = 1e-6;
  const zeroMinuteEvents = rows.filter((row) => num(row.expected_minutes) <= ZERO_MINUTES_EPSILON && (
    num(row.xpts) > EVENT_EPSILON || num(row.e_goals) > EVENT_EPSILON || num(row.e_assists) > EVENT_EPSILON
    || num(row.e_bonus) > EVENT_EPSILON || num(row.e_defcon) > EVENT_EPSILON
  ));
  gates.push(gate("Players receive no events while expected to play zero minutes", zeroMinuteEvents.length === 0,
    zeroMinuteEvents.length
      ? `${zeroMinuteEvents.length} failures: ${zeroMinuteEvents.slice(0, 12).map((row) => `${row.web_name} ${row.team} (${row.expected_minutes} mins, ${row.xpts} xPTS)`).join(" | ")}`
      : "0 failures"));

  const goalConservation = [];
  for (const [team, teamRows] of groupBy(rows, "team")) {
    const lambda = Math.max(...teamRows.map((row) => num(row.lambda_team, NaN)).filter(Number.isFinite));
    const sum = teamRows.reduce((total, row) => total + num(row.e_goals), 0);
    if (!Number.isFinite(lambda) || lambda <= 0) {
      goalConservation.push({ team, pass: false, lambda: null, sum: rounded(sum), ratio: null });
      continue;
    }
    const ratio = sum / lambda;
    goalConservation.push({ team, pass: Math.abs(ratio - 1) <= 0.05, lambda: rounded(lambda, 4), sum: rounded(sum, 4), ratio: rounded(ratio, 4) });
  }
  const badGoalConservation = goalConservation.filter((row) => !row.pass);
  gates.push(gate("Player expected goals conserve each team's expected goals", badGoalConservation.length === 0,
    `${badGoalConservation.length} teams outside 5%`));

  const penaltyTeams = [];
  for (const [team, teamRows] of groupBy(rows, "team")) {
    const sum = teamRows.reduce((total, row) => total + num(row.penalty_share), 0);
    penaltyTeams.push({ team, penalty_share_sum: rounded(sum, 4), team_penalty_rate: rounded(Math.max(...teamRows.map((row) => num(row.team_penalty_rate))), 4) });
  }

  const watch = {
    haaland: findPlayer(rows, "Haaland", "MCI"),
    watkins: findPlayer(rows, "Watkins", "AVL"),
    palmer: findPlayer(rows, "Palmer", "CHE"),
    neto: findPlayer(rows, "Neto", "CHE"),
    caicedo: findPlayer(rows, "Caicedo", "CHE"),
    saka: findPlayer(rows, "Saka", "ARS"),
    rice: findPlayer(rows, "Rice", "ARS"),
    virgil: findPlayer(rows, "Virgil", "LIV"),
    alisson: findPlayer(rows, "A.Becker", "LIV") || findPlayer(rows, "Alisson", "LIV"),
    nunes: findPlayer(rows, "Matheus N.", "MCI") || findPlayer(rows, "Matheus Nunes", "MCI"),
    gabriel: findPlayer(rows, "Gabriel", "ARS"),
    gomes: findPlayer(rows, "Gomes", "AVL"),
    lavia: findPlayer(rows, "Lavia", "CHE"),
    lacroix: findPlayer(rows, "Lacroix"),
    osula: findPlayer(rows, "Osula", "NEW"),
  };

  for (const [label, player] of [["Virgil", watch.virgil], ["Alisson", watch.alisson], ["Matheus Nunes", watch.nunes]]) {
    gates.push(gate(`${label} has starter-level GW1 minutes`, player && num(player.start_probability) >= 0.999 && num(player.expected_minutes) >= 65,
      player ? `${player.web_name}: ${rounded(player.start_probability, 3)} start, ${rounded(player.expected_minutes, 1)} minutes` : "player missing"));
  }

  for (const [label, player] of [["Gomes", watch.gomes], ["Lavia", watch.lavia]]) {
    const predictedStarter = player && num(player.start_probability) >= 0.999;
    const starterMinutesHold = player
      && player.projection_route === "engine"
      && num(player.xpts) > 0
      && (!predictedStarter || num(player.expected_minutes) >= 65);
    gates.push(gate(`${label} keeps an engine projection and starter-level minutes when selected`, starterMinutesHold,
      player
        ? `${player.web_name} ${player.team}: ${rounded(player.xpts)} xPTS, ${rounded(player.start_probability, 3)} start, ${rounded(player.expected_minutes, 1)} minutes, ${player.projection_route || "missing route"}`
        : "player missing"));
  }

  gates.push(gate("Gomes and Lavia low-output results remain visible for review",
    [watch.gomes, watch.lavia].every((player) => !player || num(player.xpts) >= 2),
    [watch.gomes, watch.lavia].filter(Boolean).map((player) => `${player.web_name} ${player.team} ${rounded(player.xpts)} xPTS`).join(" | ") || "players missing",
    "warning"));

  const osulaKnownSample = watch.osula ? String(watch.osula.historical_nineties ?? "").trim() : "";
  const osulaLowSample = watch.osula && osulaKnownSample !== "" && Number.isFinite(Number(osulaKnownSample)) && Number(osulaKnownSample) < 10;
  gates.push(gate("Osula cannot receive low-sample role amplification",
    watch.osula && (!osulaLowSample || !/\|role:/.test(String(watch.osula.rate_source || ""))),
    watch.osula
      ? `${watch.osula.web_name} ${watch.osula.team}: ${rounded(watch.osula.xpts)} xPTS, ${rounded(watch.osula.historical_nineties, 2)} 90s, ${watch.osula.rate_source || "unknown rate"}`
      : "player missing"));
  gates.push(gate("Osula premium projection remains visible for review",
    !watch.osula || !osulaLowSample || num(watch.osula.xpts) <= 5,
    watch.osula ? `${rounded(watch.osula.xpts)} xPTS at ${rounded(watch.osula.expected_minutes, 1)} minutes` : "player missing",
    "warning"));

  gates.push(gate("Transferred players use their resolved current club",
    !watch.lacroix || (upper(watch.lacroix.team) === "CHE" && watch.lacroix.projection_route === "engine" && num(watch.lacroix.xpts) > 0),
    watch.lacroix ? `Lacroix: ${watch.lacroix.team}, ${rounded(watch.lacroix.xpts)} xPTS` : "No Lacroix row in this test table"));

  gates.push(gate("Palmer projects above Neto", watch.palmer && watch.neto && num(watch.palmer.xpts) > num(watch.neto.xpts),
    watch.palmer && watch.neto ? `${rounded(watch.palmer.xpts)} vs ${rounded(watch.neto.xpts)}` : "player missing"));
  gates.push(gate("Palmer projects above Caicedo", watch.palmer && watch.caicedo && num(watch.palmer.xpts) > num(watch.caicedo.xpts),
    watch.palmer && watch.caicedo ? `${rounded(watch.palmer.xpts)} vs ${rounded(watch.caicedo.xpts)}` : "player missing"));
  gates.push(gate("Saka projects above Rice", watch.saka && watch.rice && num(watch.saka.xpts) > num(watch.rice.xpts),
    watch.saka && watch.rice ? `${rounded(watch.saka.xpts)} vs ${rounded(watch.rice.xpts)}` : "player missing"));
  gates.push(gate("Haaland separates from Watkins", watch.haaland && watch.watkins && num(watch.haaland.xpts) - num(watch.watkins.xpts) >= 1.5,
    watch.haaland && watch.watkins ? `${rounded(watch.haaland.xpts)} vs ${rounded(watch.watkins.xpts)}, gap ${rounded(num(watch.haaland.xpts) - num(watch.watkins.xpts))}` : "player missing"));

  const baselinePlayers = baseline.players || {};
  const deltas = {};
  for (const player of Object.values(watch)) {
    if (!player) continue;
    const key = playerKey(player);
    const old = baselinePlayers[key];
    if (!old) continue;
    deltas[key] = {
      before_xpts: old.xpts,
      after_xpts: rounded(player.xpts),
      xpts_delta: rounded(num(player.xpts) - num(old.xpts)),
      before_minutes: old.expected_minutes,
      after_minutes: rounded(player.expected_minutes, 1),
      minutes_delta: rounded(num(player.expected_minutes) - num(old.expected_minutes), 1),
    };
  }

  const criticalFailures = gates.filter((item) => item.severity === "critical" && !item.pass);
  return {
    pass: criticalFailures.length === 0,
    generated_at: new Date().toISOString(),
    gates,
    critical_failures: criticalFailures,
    audit,
    watch_players: Object.fromEntries(Object.entries(watch).map(([key, row]) => [key, playerSummary(row)])),
    baseline_deltas: deltas,
    goal_conservation: goalConservation,
    penalty_teams: penaltyTeams,
    probability_failures: probabilityFailures.slice(0, 50).map(playerSummary),
    zero_minute_event_failures: zeroMinuteEvents.slice(0, 50).map(playerSummary),
    missing_engine_players: missingEngine.slice(0, 100).map((row) => ({ web_name: row.web_name, team: row.team })),
  };
}

export function renderReleaseMarkdown(result) {
  const status = result.pass ? "PASS" : "FAIL";
  const lines = [
    "# ZEUS Live xPTS Validation", "",
    `**Release status: ${status}**`,
    `Generated: ${result.generated_at}`, "",
    "## Release gates", "",
    ...result.gates.map((item) => `- **${item.pass ? "PASS" : item.severity === "warning" ? "WARN" : "FAIL"}: ${item.name}**  \n  ${item.detail}`),
    "", "## Named-player output", "",
    "| Player | xPTS | xMins | Start | Team λ | Opp λ | CS | xG | Pen xG | xA | Bonus | DEFCON | Hist 90s | Used npxG90 | Used xA90 | Rate source |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...Object.values(result.watch_players).filter(Boolean).map((player) =>
      `| ${player.web_name} (${player.team}) | ${player.xpts.toFixed(3)} | ${player.expected_minutes.toFixed(1)} | ${(player.start_probability * 100).toFixed(1)}% | ${player.lambda_team.toFixed(3)} | ${player.lambda_opponent.toFixed(3)} | ${(player.p_cs * 100).toFixed(1)}% | ${player.e_goals.toFixed(3)} | ${player.e_pen_goals.toFixed(3)} | ${player.e_assists.toFixed(3)} | ${player.e_bonus.toFixed(3)} | ${player.e_defcon.toFixed(3)} | ${player.historical_nineties.toFixed(2)} | ${player.used_npxg90.toFixed(3)} | ${player.used_xa90.toFixed(3)} | ${player.rate_source || "-"} |`
    ),
    "", "## Before and after", "",
    "| Player | Before xPTS | After xPTS | Change | Before mins | After mins |",
    "|---|---:|---:|---:|---:|---:|",
    ...Object.entries(result.baseline_deltas).map(([key, row]) =>
      `| ${key.replace("|", " (") + ")"} | ${row.before_xpts.toFixed(3)} | ${row.after_xpts.toFixed(3)} | ${row.xpts_delta >= 0 ? "+" : ""}${row.xpts_delta.toFixed(3)} | ${row.before_minutes.toFixed(1)} | ${row.after_minutes.toFixed(1)} |`
    ),
    "", "## Whole-table audit", "",
    renderMarkdown(result.audit),
  ];
  if (!result.pass) {
    lines.push("", "## Blocking failures", "", ...result.critical_failures.map((item) => `- ${item.name}: ${item.detail}`));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const csv = args.find((arg) => !arg.startsWith("--")) || process.env.CSV;
  if (!csv) throw new Error("Usage: node jobs/xpts_release_gate.mjs <live-projections.csv> [--baseline file] [--report file] [--json file]");
  const valueAfter = (flag, fallback) => {
    const index = args.indexOf(flag);
    return resolve(index >= 0 ? args[index + 1] : fallback);
  };
  const baselinePath = valueAfter("--baseline", process.env.BASELINE || "config/xpts-validation-baseline.json");
  const reportPath = valueAfter("--report", process.env.REPORT || "docs/xpts-live-validation-latest.md");
  const jsonPath = valueAfter("--json", process.env.JSON || "docs/xpts-live-validation-latest.json");
  const rows = parseCsv(readFileSync(resolve(csv), "utf8"));
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const result = evaluateRelease(rows, baseline);
  mkdirSync(dirname(reportPath), { recursive: true });
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(reportPath, renderReleaseMarkdown(result));
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ pass: result.pass, report: reportPath, json: jsonPath, failures: result.critical_failures }, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
