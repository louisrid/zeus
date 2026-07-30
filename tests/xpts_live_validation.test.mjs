import test from "node:test";
import assert from "node:assert/strict";
import { buildValidationRows, rowsToCsv } from "../jobs/export_xpts_validation.mjs";
import { evaluateRelease } from "../jobs/xpts_release_gate.mjs";
import { parseCsv } from "../jobs/xpts_audit.mjs";

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
    ...teamRows("AVL", [{ name: "Watkins", position: "FWD", xpts: 5.1, xg: 0.45, xa: 0.12 }]),
    ...teamRows("CHE", [
      { name: "Palmer", position: "MID", xpts: 6.0, xg: 0.42, xa: 0.3 },
      { name: "Neto", position: "MID", xpts: 4.1, xg: 0.2, xa: 0.18 },
      { name: "Caicedo", position: "MID", xpts: 3.5, xg: 0.06, xa: 0.08 },
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
