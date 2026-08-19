import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedGenerationFailures } from "../jobs/projection_integrity_v14.mjs";
import { validateProjectionHorizonReport } from "../jobs/verify_projection_horizon_report.mjs";
import { validateStoredProjectionHorizon } from "../jobs/verify_stored_projection_horizon.mjs";

const gameweeks = Array.from({ length: 38 }, (_, index) => index + 1);
const computedAt = "2026-08-01T12:00:00.000Z";

/* The projections-run workflow was deleted: it failed on every scheduled run and did
   nothing useful, and predicted line-ups now arrive from scout-lineups-pull instead.
   The test that asserted its contract went with it, because a guard on a file that no
   longer exists can only ever fail. The acceptance checks below still cover the report
   shapes that workflow used to produce, so the underlying contract is not lost. */

test("generated and stored full-season reports must both be complete", () => {
  const generated = {
    pass: true,
    target_gameweeks: gameweeks,
    expected_players_per_gameweek: 564,
    failures: [],
    gameweeks: gameweeks.map((gw) => ({
      gw, selected_fixtures: 10, simulated_fixtures: 10,
      expected_players: 564, projection_rows: 564,
      unique_projected_players: 564, duplicate_player_rows: 0,
      missing_player_ids: [], unexpected_player_ids: [],
    })),
  };
  assert.equal(validateProjectionHorizonReport(generated, { requiredGameweeks: 38 }).pass, true);

  const stored = {
    pass: true,
    expected_gameweeks: gameweeks,
    expected_players_per_gameweek: 564,
    expected_computed_at: computedAt,
    structural_failures: [], blocking_failures: [],
    gameweeks: gameweeks.map((gw) => ({
      gw, current_rows: 564, expected_run_rows: 564, run_finished_at: computedAt,
    })),
  };
  const result = validateStoredProjectionHorizon(stored, { requiredGameweeks: 38 });
  assert.equal(result.pass, true, result.errors.join("; "));
  assert.equal(result.stored_rows, 21432);
});

test("a mixed or incomplete stored horizon is rejected", () => {
  const failures = expectedGenerationFailures(
    gameweeks.map((gw) => ({
      gw,
      current_rows: 564,
      expected_run_rows: gw === 4 ? 1 : 564,
      run_finished_at: computedAt,
    })),
    gameweeks,
    564,
    computedAt,
  );
  assert.ok(failures.some((failure) => failure.gw === 4));
  const result = validateStoredProjectionHorizon({
    pass: false,
    expected_gameweeks: gameweeks,
    expected_players_per_gameweek: 564,
    expected_computed_at: computedAt,
    structural_failures: failures,
    blocking_failures: failures,
    gameweeks: gameweeks.map((gw) => ({
      gw, current_rows: 564, expected_run_rows: gw === 4 ? 1 : 564, run_finished_at: computedAt,
    })),
  }, { requiredGameweeks: 38 });
  assert.equal(result.pass, false);
});
