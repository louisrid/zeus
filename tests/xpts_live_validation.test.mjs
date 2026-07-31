import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readReleaseWorkflow } from "./release_workflow_fixture.mjs";
import { buildValidationRows, rowsToCsv } from "../jobs/export_xpts_validation.mjs";
import { evaluateRelease } from "../jobs/xpts_release_gate.mjs";
import { auditRows, parseCsv } from "../jobs/xpts_audit.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { selectLeagueRateMaps } from "../lib/engine/layer2_allocation.mjs";

function row({ name, team, position = "MID", xpts = 3, xg = 0.05, xa = 0.03, starter = true }) {
  return {
    player_id: `${team}-${name}`,
    fpl_id: `${team}-${name}`,
    web_name: name,
    team,
    position,
    price: 6,
    status: "a",
    chance_of_playing: 100,
    gw: 1,
    xpts,
    ep_sd: 2,
    expected_minutes: starter ? 90 : 0,
    start_probability: starter ? 1 : 0,
    cameo_probability: 0,
    probability_60_minutes: starter ? 1 : 0,
    minutes_source: starter ? "lineup-starter" : "lineup-notNamed",
    lineup_source: "test",
    lineup_confidence: 1,
    lambda_team: 1.2,
    lambda_opponent: 1.1,
    used_npxg90: 0.2,
    used_xa90: 0.15,
    rate_source: "history-player|role:attacking-midfielder",
    goal_share: 0.1,
    assist_share: 0.1,
    penalty_share: 0,
    team_penalty_rate: 0.12,
    e_pen_goals: 0,
    e_goals: starter ? xg : 0,
    e_assists: starter ? xa : 0,
    p_goal: starter ? Math.min(0.8, xg) : 0,
    p_assist: starter ? Math.min(0.8, xa) : 0,
    p_cs: starter ? 0.3 : 0,
    e_bonus: starter ? 0.2 : 0,
    e_defcon: starter ? 0.1 : 0,
    prior_blend: 0,
    historical_nineties: 30,
    historical_points_per_90: 4,
    projection_route: "engine",
    model_version: "test",
    computed_at: "2026-07-30T12:00:00Z",
  };
}

function teamRows(team, watch = []) {
  const starters = [];
  starters.push(row({ name: watch.find((x) => x.position === "GKP")?.name || `${team} GK`, team, position: "GKP", xpts: watch.find((x) => x.position === "GKP")?.xpts || 3.2 }));
  for (const item of watch.filter((x) => x.position !== "GKP")) starters.push(row({ ...item, team }));
  while (starters.length < 11) starters.push(row({ name: `${team} Player ${starters.length}`, team, position: starters.length < 5 ? "DEF" : starters.length < 9 ? "MID" : "FWD", xpts: 2.8 }));
  const goalTotal = starters.reduce((s, x) => s + Number(x.e_goals), 0);
  const scale = 1.2 / goalTotal;
  for (const player of starters) player.e_goals *= scale;
  const bench = row({ name: `${team} Bench`, team, position: "MID", xpts: 0, xg: 0, xa: 0, starter: false });
  return [...starters, bench];
}

function passingRows() {
  const rows = [
    ...teamRows("MCI", [
      { name: "Haaland", position: "FWD", xpts: 7.2, xg: 0.7, xa: 0.15 },
      { name: "Matheus N.", position: "DEF", xpts: 3.1, xg: 0.06, xa: 0.08 },
    ]),
    ...teamRows("AVL", [
      { name: "Watkins", position: "FWD", xpts: 5.1, xg: 0.45, xa: 0.12 },
      { name: "Gomes", position: "MID", xpts: 3.0, xg: 0.08, xa: 0.1 },
    ]),
    ...teamRows("CHE", [
      { name: "Palmer", position: "MID", xpts: 6.0, xg: 0.42, xa: 0.3 },
      { name: "Neto", position: "MID", xpts: 4.1, xg: 0.2, xa: 0.18 },
      { name: "Caicedo", position: "MID", xpts: 3.5, xg: 0.06, xa: 0.08 },
      { name: "Lavia", position: "MID", xpts: 3.1, xg: 0.05, xa: 0.07 },
    ]),
    ...teamRows("NEW", [
      { name: "Osula", position: "FWD", xpts: 4.6, xg: 0.38, xa: 0.08 },
    ]),
    ...teamRows("ARS", [
      { name: "Saka", position: "MID", xpts: 6.2, xg: 0.4, xa: 0.3 },
      { name: "Rice", position: "MID", xpts: 4.8, xg: 0.12, xa: 0.2 },
      { name: "Gabriel", position: "DEF", xpts: 5.0, xg: 0.12, xa: 0.05 },
    ]),
    ...teamRows("LIV", [
      { name: "A.Becker", position: "GKP", xpts: 3.6, xg: 0, xa: 0 },
      { name: "Virgil", position: "DEF", xpts: 4.2, xg: 0.14, xa: 0.06 },
    ]),
  ];
  const penaltyNames = new Set(["Haaland", "Palmer", "Saka"]);
  for (const player of rows) if (penaltyNames.has(player.web_name)) player.penalty_share = 1;
  const osula = rows.find((player) => player.web_name === "Osula" && player.team === "NEW");
  osula.historical_nineties = 5;
  osula.rate_source = "understat-shrunk";
  return rows;
}

const baseline = { players: {} };

test("live release gate accepts a coherent engine-only projection table", () => {
  const result = evaluateRelease(passingRows(), baseline);
  assert.equal(result.pass, true, result.critical_failures.map((x) => x.name).join(", "));
});

test("live release gate blocks missing engine rows and obvious player-order contradictions", () => {
  const rows = passingRows();
  const palmer = rows.find((x) => x.web_name === "Palmer");
  const caicedo = rows.find((x) => x.web_name === "Caicedo");
  palmer.xpts = 3;
  caicedo.xpts = 4;
  rows.find((x) => x.web_name === "Virgil").projection_route = "MISSING_ENGINE_PROJECTION";
  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.critical_failures.some((x) => x.name.includes("engine projection")));
  assert.ok(result.critical_failures.some((x) => x.name.includes("Palmer projects above Caicedo")));
});

test("validation exporter selects the newest coherent generation and emits audit CSV", () => {
  const players = [
    { id: 1, fpl_id: 101, web_name: "Starter", team_id: 10, position: "MID", price: 7, status: "a", archive: false },
  ];
  const teams = [{ id: 10, name: "Team", short_name: "TST" }];
  const priors = [{ player_id: 1, nineties: 20, points_per_90: 5 }];
  const projections = [
    { player_id: 1, gw: 1, model_version: "old", computed_at: "2026-07-30T10:00:00Z", ep_mean: 1 },
    { player_id: 1, gw: 1, model_version: "new", computed_at: "2026-07-30T12:00:00Z", ep_mean: 5, r_exp_minutes: 80, r_p_start: 1, r_p_cameo: 0, r_p60: 0.9, minutes_source: "lineup-starter", rate_source: "history|role:creator", lambda_team: 1.5, lambda_opponent: 1.0 },
  ];
  const built = buildValidationRows({ players, teams, projections, priors, gw: 1 });
  assert.equal(built.rows[0].xpts, 5);
  assert.equal(built.generation.stale_rows_excluded, 1);
  const parsed = parseCsv(rowsToCsv(built.rows));
  assert.equal(parsed[0].web_name, "Starter");
  assert.equal(parsed[0].projection_route, "engine");
});


test("validation exporter accepts the canonical live players schema without raw FPL alias columns", () => {
  const players = [{
    id: 7, fpl_id: 107, web_name: "Canonical", name: "Canonical Player",
    team_id: 3, position: "MID", price: 6.5, status: "a", chance_of_playing: 100, archive: false,
  }];
  const teams = [{ id: 3, name: "Canonical FC", short_name: "CAN", archive: false }];
  const projections = [{
    player_id: 7, gw: 1, model_version: "canonical", computed_at: "2026-07-30T13:00:00Z",
    ep_mean: 4.2, r_exp_minutes: 82, r_p_start: 1, r_p_cameo: 0, r_p60: 0.95,
  }];
  const built = buildValidationRows({ players, teams, projections, priors: [], gw: 1 });
  assert.equal(built.rows[0].team, "CAN");
  assert.equal(built.rows[0].price, 6.5);
  assert.equal(built.rows[0].position, "MID");
  assert.equal(built.rows[0].chance_of_playing, 100);
  assert.equal(built.rows[0].projection_route, "engine");
});


test("validation exporter groups transferred players by the team used in the projection", () => {
  const players = [{ id: 9, fpl_id: 109, web_name: "Moved GK", team_id: 1, position: "GKP", price: 4.5, status: "a", archive: false }];
  const teams = [
    { id: 1, name: "Old FC", short_name: "OLD" },
    { id: 2, name: "New FC", short_name: "NEW" },
  ];
  const projections = [{
    player_id: 9, gw: 1, model_version: "new", computed_at: "2026-07-30T14:00:00Z",
    ep_mean: 3.5, r_exp_minutes: 90, r_p_start: 1, r_p_cameo: 0, r_p60: 1,
    quantiles: { diagnostics: { resolved_team_id: 2 } },
  }];
  const built = buildValidationRows({ players, teams, projections, priors: [], gw: 1 });
  assert.equal(built.rows[0].team, "NEW");
  assert.equal(built.rows[0].resolved_team_id, 2);
});

test("permanent release workflow runs only when manually dispatched", () => {
  const workflow = readReleaseWorkflow();
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.doesNotMatch(workflow, /\n\s*schedule:/);
});


test("a selected lineup replacement is treated as a starter, not a failed non-starter", () => {
  const replacement = row({ name: "Replacement", team: "TST", position: "DEF", xpts: 3, starter: true });
  replacement.minutes_source = "lineup-replacement";
  const namedBench = row({ name: "Bench", team: "TST", position: "MID", xpts: 0, starter: false });
  const audit = auditRows([replacement, namedBench], "replacement.csv");
  assert.equal(audit.checks.gw1_nonstarters_zero_start.pass, true);
  assert.equal(audit.checks.gw1_nonstarters_zero_start.not_zero.length, 0);
});

test("audit rejects zero outfield priors and impossible defender goal concentration", () => {
  const bad = row({ name: "Bad Prior Defender", team: "BAD", position: "DEF", xpts: 8, xg: 0.7, xa: 0.1 });
  bad.rate_source = "prior-positional";
  bad.used_npxg90 = 0;
  bad.used_xa90 = 0;
  bad.goal_share = 0.32;
  bad.e_goals = 0.7;
  const audit = auditRows([bad], "bad.csv");
  assert.equal(audit.checks.nonzero_outfield_priors.pass, false);
  assert.equal(audit.checks.defender_attack_concentration.pass, false);
});

test("engine config exposes every Step 4 and Step 5 runtime input", () => {
  const raw = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url), "utf8"));
  const cfg = engineConfig(raw);
  assert.equal(cfg.rateShrinkNineties, 20);
  assert.equal(cfg.minimumRoleNineties, 10);
  assert.equal(cfg.kStartMinutes, 4);
  assert.ok(cfg.leagueRates.npxg90.MID > 0);
  assert.ok(cfg.leagueRates.xa90.DEF > 0);
  assert.ok(cfg.leagueRates.cbit90.DEF > 0);
  assert.ok(cfg.leagueRates.recoveries90.MID > 0);
  assert.ok(cfg.penRateShrinkMatches > 0);
  assert.ok(cfg.penLambdaExponent > 0);
});

test("projection runtime persists post-normalisation replacement routes and rejects zero rate maps", () => {
  const source = readFileSync(new URL("../jobs/projections_run.mjs", import.meta.url), "utf8");
  assert.match(source, /normaliseTeamStarts\(fs, cfg\)[\s\S]*finalSource = f\?\.minutes_source/);
  assert.match(source, /selectLeagueRateMaps\(/);
  assert.match(source, /currentSeasonFinished >= 10/);
});


test("league-rate selection rejects zero preseason maps and falls back to positive priors", () => {
  const zero = {
    npxg90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
    xa90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
    cbit90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
    recoveries90: { GKP: 0, DEF: 0, MID: 0, FWD: 0 },
  };
  const configured = {
    npxg90: { GKP: 0.0002, DEF: 0.0572, MID: 0.1531, FWD: 0.4098 },
    xa90: { GKP: 0.0018, DEF: 0.0579, MID: 0.1262, FWD: 0.0603 },
    cbit90: { GKP: 1.229, DEF: 5.979, MID: 2.316, FWD: 1.644 },
    recoveries90: { GKP: 8.152, DEF: 3.696, MID: 4.421, FWD: 2.349 },
  };
  const selected = selectLeagueRateMaps({
    currentSeasonRates: zero,
    priorSeasonRates: zero,
    configuredRates: configured,
    currentSeasonFinished: 0,
  });
  assert.deepEqual(selected, configured);
  assert.throws(() => selectLeagueRateMaps({
    currentSeasonRates: zero,
    priorSeasonRates: zero,
    configuredRates: zero,
    currentSeasonFinished: 0,
  }), /No usable league npxg90 priors/);
});

test("release gate blocks collapsed named starters and low-sample role feedback loops", () => {
  const rows = passingRows();
  const starter = rows.find((x) => x.team === "AVL" && x.web_name.startsWith("AVL Player"));
  starter.web_name = "Gomes";
  starter.expected_minutes = 48.5;
  starter.start_probability = 1;
  starter.minutes_source = "lineup-starter";

  const lowSample = rows.find((x) => x.team === "MCI" && x.web_name.startsWith("MCI Player"));
  lowSample.historical_nineties = 8.9;
  lowSample.rate_source = "understat|role:complete_forward";

  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.critical_failures.some((x) => x.name.includes("collapsed conditional minutes")));
  assert.ok(result.critical_failures.some((x) => x.name.includes("Low-sample players")));
});




test("named Gomes, Lavia and Osula regression checks block the reported failure modes", () => {
  const rows = passingRows();
  const gomes = rows.find((x) => x.web_name === "Gomes" && x.team === "AVL");
  const lavia = rows.find((x) => x.web_name === "Lavia" && x.team === "CHE");
  const osula = rows.find((x) => x.web_name === "Osula" && x.team === "NEW");
  gomes.expected_minutes = 50;
  lavia.projection_route = "MISSING_ENGINE_PROJECTION";
  osula.rate_source = "understat|role:complete_forward";
  osula.xpts = 5.4;

  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.critical_failures.some((x) => x.name.includes("Gomes keeps an engine projection")));
  assert.ok(result.critical_failures.some((x) => x.name.includes("Lavia keeps an engine projection")));
  assert.ok(result.critical_failures.some((x) => x.name.includes("Osula cannot receive low-sample role amplification")));
  const osulaWarning = result.gates.find((x) => x.name.includes("Osula premium projection"));
  assert.equal(osulaWarning.severity, "warning");
  assert.equal(osulaWarning.pass, false);
});

test("release gate does not mistake missing PL history or the structural goalkeeper role for a low-sample feedback loop", () => {
  const rows = passingRows();
  const promoted = rows.find((x) => x.team === "AVL" && x.web_name.startsWith("AVL Player"));
  promoted.historical_nineties = "";
  promoted.rate_source = "archive-expected|role:attacking_defender";
  const keeper = rows.find((x) => x.team === "MCI" && x.position === "GKP");
  keeper.historical_nineties = 2;
  keeper.rate_source = "archive-expected|role:goalkeeper";
  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, true, result.critical_failures.map((x) => `${x.name}: ${x.detail}`).join("\n"));
});

test("release gate accepts proportional output from a tiny positive cameo but rejects events at genuine zero minutes", () => {
  const cameoRows = passingRows();
  const cameo = cameoRows.find((x) => x.team === "AVL" && x.web_name.endsWith("Bench"));
  cameo.expected_minutes = 0.009870089159294545;
  cameo.cameo_probability = 0.009870089159294545;
  cameo.xpts = 0.011;
  cameo.p_goal = 0.0001;
  const cameoResult = evaluateRelease(cameoRows, baseline);
  assert.equal(cameoResult.pass, true, cameoResult.critical_failures.map((x) => `${x.name}: ${x.detail}`).join("\n"));

  const zeroRows = passingRows();
  const impossible = zeroRows.find((x) => x.team === "AVL" && x.web_name.endsWith("Bench"));
  impossible.expected_minutes = 0;
  impossible.xpts = 0.011;
  const zeroResult = evaluateRelease(zeroRows, baseline);
  assert.equal(zeroResult.pass, false);
  assert.ok(zeroResult.critical_failures.some((x) => x.name.includes("zero minutes")));
});

test("release gate blocks a transferred player remaining at his old club", () => {
  const rows = [...passingRows(), ...teamRows("CRY", [
    { name: "Lacroix", position: "DEF", xpts: 4, xg: 0.1, xa: 0.04 },
  ])];
  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.critical_failures.some((x) => x.name.includes("resolved current club")));
});

test("premium defender outliers are visible warnings rather than silent passes or arbitrary hard failures", () => {
  const rows = passingRows();
  rows.find((x) => x.web_name === "Gabriel").xpts = 7.7;
  const result = evaluateRelease(rows, baseline);
  assert.equal(result.pass, true, result.critical_failures.map((x) => x.name).join(", "));
  const warning = result.gates.find((x) => x.name.includes("Premium defender"));
  assert.equal(warning.severity, "warning");
  assert.equal(warning.pass, false);
  assert.match(warning.detail, /Gabriel ARS 7\.7 xPTS/);
});
