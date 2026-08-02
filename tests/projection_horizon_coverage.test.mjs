import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackGoalEnvironment,
  fallbackGoalEnvironmentForTeams,
} from "../lib/engine/layer0_market.mjs";
import {
  projectionBatchReport,
  projectionFixtureKey,
  assertProjectionBatchComplete,
  projectionWriteBatches,
} from "../lib/projection_batch.mjs";
import { expectedGenerationFailures } from "../jobs/projection_integrity_v14.mjs";
import { validateProjectionHorizonReport } from "../jobs/verify_projection_horizon_report.mjs";
import { validateStoredProjectionHorizon } from "../jobs/verify_stored_projection_horizon.mjs";

function syntheticHorizon(playerCount = 40) {
  const targetGws = Array.from({ length: 8 }, (_, index) => index + 1);
  const teams = Array.from({ length: 20 }, (_, index) => index + 1);
  const profiles = Array.from({ length: playerCount }, (_, index) => ({
    player_id: String(index + 1),
    team_id: String(teams[index % teams.length]),
  }));
  const fixtures = [];
  for (const gw of targetGws) {
    for (let index = 0; index < 10; index += 1) {
      fixtures.push({
        id: String(gw * 100 + index + 1),
        fpl_id: String(gw * 100 + index + 1),
        gw: String(gw),
        home_team: String(teams[index]),
        away_team: String(teams[19 - index]),
      });
    }
  }
  const projectionRows = targetGws.flatMap((gw) => profiles.map((profile) => ({
    player_id: profile.player_id,
    gw: String(gw),
  })));
  const simulatedFixtureKeys = new Set(fixtures.map((fixture) => projectionFixtureKey(fixture)));
  return { targetGws, fixtures, projectionRows, profiles, simulatedFixtureKeys };
}


test("the complete odds-free helper preserves the established overall-strength fallback", () => {
  const expected = fallbackGoalEnvironment(5, 3, 2.8, 1.13);
  const actual = fallbackGoalEnvironmentForTeams({
    homeTeam: { strength: 5 },
    awayTeam: { strength: 3 },
    leagueTeams: [],
    leagueMeanGoals: 2.8,
    homeAdvantage: 1.13,
  });
  assert.deepEqual(actual, expected);
});


test("venue attack and defence ratings price future fixtures when overall strength is absent", () => {
  const leagueTeams = [
    { strength_attack_home: 1300, strength_defence_home: 1250, strength_attack_away: 1200, strength_defence_away: 1180 },
    { strength_attack_home: 1000, strength_defence_home: 1000, strength_attack_away: 1000, strength_defence_away: 1000 },
    { strength_attack_home: 850, strength_defence_home: 820, strength_attack_away: 800, strength_defence_away: 780 },
  ];
  const result = fallbackGoalEnvironmentForTeams({
    homeTeam: { strength: 0, ...leagueTeams[0] },
    awayTeam: { strength: null, ...leagueTeams[2] },
    leagueTeams,
    leagueMeanGoals: 2.8,
    homeAdvantage: 1.13,
  });
  assert.equal(result.deoverround_method, "team-component-strength-fallback");
  assert.ok(result.lambda_home > result.lambda_away, JSON.stringify(result));
  assert.ok(result.lambda_home + result.lambda_away > 2.8, JSON.stringify(result));
});


test("a valid league mean still produces an explicit neutral environment when team ratings are unavailable", () => {
  const result = fallbackGoalEnvironmentForTeams({
    homeTeam: {},
    awayTeam: {},
    leagueTeams: [],
    leagueMeanGoals: 2.8,
    homeAdvantage: 1.13,
  });
  assert.equal(result.deoverround_method, "league-neutral-fallback");
  assert.ok(result.lambda_home > result.lambda_away, JSON.stringify(result));
  assert.ok(Math.abs(result.lambda_home + result.lambda_away - 2.8) < 0.001, JSON.stringify(result));
});


test("an eight-gameweek batch passes only when every fixture and every participating player is present", () => {
  const input = syntheticHorizon();
  const report = projectionBatchReport({ ...input, expectedPlayersPerGameweek: 40 });
  assert.equal(report.pass, true, JSON.stringify(report.failures));
  assert.equal(report.gameweeks.length, 8);
  for (const row of report.gameweeks) {
    assert.equal(row.selected_fixtures, 10);
    assert.equal(row.simulated_fixtures, 10);
    assert.equal(row.expected_players, 40);
    assert.equal(row.projection_rows, 40);
    assert.equal(row.unique_projected_players, 40);
  }
  assert.doesNotThrow(() => assertProjectionBatchComplete({ ...input, expectedPlayersPerGameweek: 40 }));
  const validation = validateProjectionHorizonReport(report, { requiredGameweeks: 8 });
  assert.equal(validation.pass, true, validation.errors.join("; "));
});


test("the real release scale contains exactly 564 players per gameweek and 4512 rows", () => {
  const input = syntheticHorizon(564);
  const report = projectionBatchReport({ ...input, expectedPlayersPerGameweek: 564 });
  assert.equal(report.pass, true, JSON.stringify(report.failures));
  assert.equal(input.projectionRows.length, 4512);
  assert.equal(report.gameweeks.length, 8);
  assert.equal(report.gameweeks.every((row) => row.expected_players === 564), true);
  assert.equal(report.gameweeks.every((row) => row.projection_rows === 564), true);
});


test("the exact V4 failure pattern, 564 GW1 rows for an eight-gameweek target, is rejected", () => {
  const input = syntheticHorizon(564);
  const report = projectionBatchReport({
    ...input,
    projectionRows: input.projectionRows.filter((row) => Number(row.gw) === 1),
    expectedPlayersPerGameweek: 564,
    simulatedFixtureKeys: new Set(input.fixtures
      .filter((fixture) => Number(fixture.gw) === 1)
      .map((fixture) => projectionFixtureKey(fixture))),
  });
  assert.equal(report.pass, false);
  assert.equal(report.gameweeks[0].projection_rows, 564);
  assert.ok(report.failures.some((failure) => failure.gw === 2 && failure.kind === "fixture_simulation_incomplete"));
  assert.ok(report.failures.some((failure) => failure.gw === 2 && failure.kind === "missing_projection_rows"));
  const validation = validateProjectionHorizonReport(report, { requiredGameweeks: 8 });
  assert.equal(validation.pass, false);
});


test("one missing fixture simulation or one missing player blocks the batch", () => {
  const input = syntheticHorizon();
  const missingFixture = new Set(input.simulatedFixtureKeys);
  missingFixture.delete(projectionFixtureKey(input.fixtures[0]));
  const missingPlayerRows = input.projectionRows.filter((row) => !(Number(row.gw) === 1 && Number(row.player_id) === 1));
  const report = projectionBatchReport({
    ...input,
    projectionRows: missingPlayerRows,
    simulatedFixtureKeys: missingFixture,
    expectedPlayersPerGameweek: 40,
  });
  assert.equal(report.pass, false);
  assert.ok(report.failures.some((failure) => failure.gw === 1 && failure.kind === "fixture_simulation_incomplete"));
  assert.ok(report.failures.some((failure) => failure.gw === 1 && failure.kind === "missing_projection_rows"));
  assert.throws(() => assertProjectionBatchComplete({
    ...input,
    projectionRows: missingPlayerRows,
    simulatedFixtureKeys: missingFixture,
    expectedPlayersPerGameweek: 40,
  }), /Projection horizon is incomplete/);
});


test("post-write integrity rejects GW1-only storage even in an eight-gameweek run", () => {
  const targetGws = [1, 2, 3, 4, 5, 6, 7, 8];
  const computedAt = "2026-07-31T04:00:00.000Z";
  const failures = expectedGenerationFailures(
    [{ gw: 1, current_rows: 564 }],
    targetGws,
    564,
  );
  assert.deepEqual(failures.map((failure) => failure.gw), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(failures.every((failure) => failure.kind === "missing_gameweek_generation"), true);

  const validation = validateStoredProjectionHorizon({
    pass: false,
    expected_gameweeks: targetGws,
    expected_players_per_gameweek: 564,
    expected_computed_at: computedAt,
    gameweeks: [{ gw: 1, current_rows: 564, expected_run_rows: 564, run_finished_at: computedAt }],
    structural_failures: failures,
    blocking_failures: failures,
  }, { requiredGameweeks: 8 });
  assert.equal(validation.pass, false);
  assert.ok(validation.errors.some((error) => error.includes("GW2")));
});


test("post-write verification accepts eight complete stored generations", () => {
  const targetGws = [1, 2, 3, 4, 5, 6, 7, 8];
  const computedAt = "2026-07-31T04:00:00.000Z";
  const validation = validateStoredProjectionHorizon({
    pass: true,
    expected_gameweeks: targetGws,
    expected_players_per_gameweek: 564,
    expected_computed_at: computedAt,
    gameweeks: targetGws.map((gw) => ({ gw, current_rows: 564, expected_run_rows: 564, run_finished_at: computedAt })),
    structural_failures: [],
    blocking_failures: [],
  }, { requiredGameweeks: 8 });
  assert.equal(validation.pass, true, validation.errors.join("; "));
  assert.equal(validation.expected_rows, 4512);
  assert.equal(validation.stored_rows, 4512);
});


test("post-write integrity rejects a mixed horizon assembled from an older run", () => {
  const targetGws = [1, 2, 3, 4, 5, 6, 7, 8];
  const current = "2026-07-31T04:00:00.000Z";
  const older = "2026-07-31T03:00:00.000Z";
  const failures = expectedGenerationFailures(
    targetGws.map((gw) => ({
      gw,
      current_rows: 564,
      expected_run_rows: gw === 1 ? 564 : 0,
      run_finished_at: gw === 1 ? current : older,
    })),
    targetGws,
    564,
    current,
  );
  assert.deepEqual(failures.map((failure) => failure.gw), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(failures.every((failure) => failure.kind === "wrong_projection_run"), true);
});


test("post-write integrity rejects a mixed same-gameweek batch even when its newest row has the current timestamp", () => {
  const targetGws = [1, 2, 3, 4, 5, 6, 7, 8];
  const current = "2026-07-31T04:00:00.000Z";
  const gameweeks = targetGws.map((gw) => ({
    gw,
    current_rows: 564,
    expected_run_rows: gw === 4 ? 1 : 564,
    run_finished_at: current,
  }));
  const failures = expectedGenerationFailures(gameweeks, targetGws, 564, current);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].gw, 4);
  assert.equal(failures[0].kind, "mixed_or_incomplete_projection_run");

  const validation = validateStoredProjectionHorizon({
    pass: false,
    expected_gameweeks: targetGws,
    expected_players_per_gameweek: 564,
    expected_computed_at: current,
    gameweeks,
    structural_failures: failures,
    blocking_failures: failures,
  }, { requiredGameweeks: 8 });
  assert.equal(validation.pass, false);
  assert.ok(validation.errors.some((error) => error.includes("GW4")));
});


test("pre-write coverage rejects a horizon whose fixtures omit one club's players", () => {
  const input = syntheticHorizon(40);
  const missingClub = input.fixtures[0].home_team;
  const fixtures = input.fixtures.filter((fixture) => !(Number(fixture.gw) === 1 && String(fixture.home_team) === String(missingClub)));
  const simulatedFixtureKeys = new Set(fixtures.map((fixture) => projectionFixtureKey(fixture)));
  const projectionRows = input.projectionRows.filter((row) => {
    if (Number(row.gw) !== 1) return true;
    const profile = input.profiles.find((candidate) => String(candidate.player_id) === String(row.player_id));
    return String(profile?.team_id) !== String(missingClub);
  });
  const report = projectionBatchReport({
    ...input,
    fixtures,
    projectionRows,
    simulatedFixtureKeys,
    expectedPlayersPerGameweek: 40,
  });
  assert.equal(report.pass, false);
  assert.ok(report.failures.some((failure) => failure.gw === 1 && failure.kind === "fixture_team_coverage_incomplete"));
});


test("Supabase write batches never mix gameweeks and protect the current gameweek until last", () => {
  const rows = [];
  for (const gw of [1, 2, 3]) {
    for (let playerId = 1; playerId <= 6; playerId += 1) rows.push({ gw, player_id: playerId });
  }
  rows.reverse();
  const batches = projectionWriteBatches(rows, [1, 2, 3], 4);
  assert.deepEqual(batches.map((batch) => batch.gw), [3, 3, 2, 2, 1, 1]);
  for (const batch of batches) {
    assert.ok(batch.rows.length <= 4);
    assert.ok(batch.rows.every((row) => row.gw === batch.gw));
    assert.deepEqual(
      batch.rows.map((row) => row.player_id),
      [...batch.rows].map((row) => row.player_id).sort((a, b) => a - b),
    );
  }
});

test("a normal full gameweek is sent as one atomic write", () => {
  const rows = Array.from({ length: 564 }, (_, index) => ({ gw: 1, player_id: index + 1 }));
  const batches = projectionWriteBatches(rows, [1], 750);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].gw, 1);
  assert.equal(batches[0].rows.length, 564);
});

test("write batching rejects rows for an unexpected gameweek", () => {
  assert.throws(
    () => projectionWriteBatches([{ gw: 9, player_id: 1 }], [1, 2, 3], 750),
    /unexpected GW9/,
  );
});
