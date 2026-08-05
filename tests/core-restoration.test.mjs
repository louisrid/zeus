// EXTERNAL-XPTS LEGACY QUARANTINE: tests marked skip below assert the retired internal projection engine.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyResolvedTeams } from "../lib/resolved_teams.mjs";
import { shrinkConditionalMinutes } from "../lib/engine/layer3_minutes.mjs";
import { attachPlayerRole } from "../lib/engine/player_roles.mjs";
import { buildScorer } from "../lib/solver/score.mjs";
import { buildBrief } from "../lib/server/fpl_brief_api.mjs";
import { readReleaseWorkflow, releaseWorkflowName } from "./release_workflow_fixture.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("resolved current-team evidence updates labels, fixtures and club-limit identity together", () => {
  const player = { id: 10, fpl_id: 110, web_name: "Lacroix", team_id: 8, team: "CRY" };
  const teams = {
    8: { id: 8, short_name: "CRY" },
    6: { id: 6, short_name: "CHE" },
  };
  const projections = new Map([[110, {
    quantiles: { diagnostics: { resolved_team_id: 6 } },
  }]]);
  const changed = applyResolvedTeams({ players: [player], teamById: teams, projections });
  assert.equal(player.team_id, 6);
  assert.equal(player.team, "CHE");
  assert.equal(player.db_team_id, 8);
  assert.equal(changed[0].source, "projection");

  player.team_id = 8;
  player.team = "CRY";
  applyResolvedTeams({
    players: [player], teamById: teams, projections,
    lineupOverrides: new Map([[110, 6]]),
  });
  assert.equal(player.team_id, 6, "fresh lineup evidence has first priority");
  assert.equal(player.team_resolution, "lineup");
});

test("small samples cannot force a predicted starter to obsolete 40 to 55 minute usage", () => {
  const leagueStarterMean = 80;
  const oneStart = shrinkConditionalMinutes(48, 1, leagueStarterMean, 4);
  const fourStarts = shrinkConditionalMinutes(230, 4, leagueStarterMean, 4);
  const established = shrinkConditionalMinutes(2400, 30, leagueStarterMean, 4);
  assert.ok(oneStart > 70 && oneStart < 80, oneStart);
  assert.ok(fourStarts > 65 && fourStarts < 75, fourStarts);
  assert.ok(Math.abs(established - 80) < 1e-9, established);
});

test("a low-sample hot streak cannot assign and reinforce its own aggressive role prior", () => {
  const model = {
    minimumPlayerNineties: 10,
    thresholds: {
      FWD: { count: 20, npxg67: 0.35, xa50: 0.10, xa67: 0.20 },
    },
  };
  const low = attachPlayerRole({ position: "FWD", nineties: 8.9, npxg90: 0.59, xa90: 0.15 }, model);
  const established = attachPlayerRole({ position: "FWD", nineties: 15, npxg90: 0.59, xa90: 0.15 }, model);
  assert.equal(low.role, null);
  assert.equal(low.role_source, "position-only");
  assert.equal(established.role, "complete_forward");
});

test("engine-only scoring remains direct for stored weeks and anchored for later fixtures", () => {
  const player = { fpl_id: 1, team_id: 1, position: "MID", status: "a" };
  const scorer = buildScorer({
    projections: new Map([[1, { ep_mean: 5 }]]),
    perGw: new Map([[1, [{ gw: 1, ep_mean: 5 }]]]),
    engineOnly: true,
    currentGw: 1,
    archivePer90: new Map(),
    understat: new Map(),
    envByTeam: new Map(),
    envByTeamGw: new Map(),
    minutesForecasts: new Map(),
    positionMeans: { MID: 3.5 },
    promotionFactor: {},
    players: [player],
    hasFixture: (_p, gw) => gw === 1 || gw === 2,
    difficultyOf: (_p, gw) => gw === 1 ? 50 : 25,
  });
  assert.equal(scorer.scoreForGw(player, 1), 5);
  assert.ok(scorer.scoreForGw(player, 2) > 5, scorer.scoreForGw(player, 2));
  assert.equal(scorer.routeOf(player, 2), "engine-anchored");
  assert.equal(scorer.scoreForGw(player, 3), 0, "a genuine blank remains zero");
});

test.skip("the stable OpenWeb brief uses the team recorded by the projection generation", () => {
  const out = buildBrief({
    gw: 1,
    teamRows: [
      { id: 8, short_name: "CRY" },
      { id: 6, short_name: "CHE" },
    ],
    playerRows: [{ id: 10, fpl_id: 110, web_name: "Lacroix", team_id: 8, position: "DEF", price: 5 }],
    projectionRows: [{
      player_id: 10, gw: 1, ep_mean: 4, model_version: "test", computed_at: "2026-07-30T20:00:00Z",
      quantiles: { diagnostics: { resolved_team_id: 6 } },
    }],
  });
  assert.equal(out.players[0].team, "CHE");
  assert.equal(out.players[0].xpts, 4);
});

test("future gameweeks, Builder range optimisation and Squad optimisation are release-protected", () => {
  const projectionJob = read("jobs/projections_run.mjs");
  assert.match(projectionJob, /normaliseProjectionHorizon\(process\.env\.PROJECTION_GWS \|\| 38\)/);
  assert.match(projectionJob, /fallbackGoalEnvironmentForTeams/);
  assert.match(projectionJob, /projectionBatchReport\(/);
  assert.match(projectionJob, /projection-horizon-report\.json/);
  assert.match(projectionJob, /expectedGameweeks:\s*targetGws/);
  assert.match(projectionJob, /expectedPlayersPerGameweek:\s*profiles\.length/);
  assert.match(projectionJob, /expectedComputedAt:\s*projectionComputedAt/);
  assert.doesNotMatch(projectionJob, /if\s*\(!lambdas\)\s*continue/,
    "an odds-free future fixture may never disappear from the run");

  const releaseWorkflow = readReleaseWorkflow();
  assert.match(releaseWorkflow, /Set permanent projection workflows to the full 38-gameweek season/);
  assert.match(releaseWorkflow, /node jobs\/prepare_permanent_projection_workflows\.mjs/);
  assert.doesNotMatch(releaseWorkflow, /git add -- \.github\/workflows\/projections-run\.yml \.github\/workflows\/presser-pull\.yml/,
    "the release check verifies permanent workflows without committing from CI");
  assert.match(releaseWorkflow, /PROJECTION_GWS:\s*['"]38['"]?/,
    "the manual release action must explicitly request all 38 gameweeks");
  assert.match(releaseWorkflow, new RegExp(`^name: ${releaseWorkflowName}$`, "m"));
  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(releaseWorkflow, /\n\s*push:/);
  assert.match(releaseWorkflow, /cancel-in-progress:\s*false/,
    "a duplicate manual run must queue instead of cancelling an active Supabase write");
  assert.match(releaseWorkflow, /install_args=\(ci --no-audit --no-fund\)/,
    "an existing lockfile must use npm ci");
  assert.match(releaseWorkflow, /install --package-lock=true --no-audit --no-fund/,
    "the first successful run must generate a dependency lockfile");
  assert.doesNotMatch(releaseWorkflow, /git add -- package-lock\.json/,
    "the read-only release check must not stage dependency files");
  assert.match(releaseWorkflow, /node --test tests\/css-integrity\.test\.mjs/);
  assert.match(releaseWorkflow, /node jobs\/verify_projection_horizon_report\.mjs projection-horizon-report\.json 38/);
  assert.match(releaseWorkflow, /node jobs\/verify_stored_projection_horizon\.mjs/);
  assert.match(releaseWorkflow, /projection-horizon-report\.json/);
  assert.match(releaseWorkflow, /stored-projection-horizon-report\.json/);
  assert.match(releaseWorkflow, /VERIFY_PROJECTION_GWS:\s*['"]38['"]?/);
  assert.match(releaseWorkflow, /name: Confirm repository cleanup is already complete/);
  assert.match(releaseWorkflow, /git ls-files -- "\$path"/,
    "cleanup must verify tracked obsolete paths without deleting or committing them");
  assert.match(releaseWorkflow, /Repository cleanup is complete\./);
  assert.doesNotMatch(releaseWorkflow, /git (?:rm|add|commit|push)/,
    "the release check must remain read-only");
  assert.match(releaseWorkflow, /config\/repository-cleanup-paths\.txt/);

  const players = read("components/PlayerControls.jsx");
  assert.match(players, /\{showGameweekRange && setRange && \(/);
  assert.ok(!/sort\.key === "XPTS"/.test(players), "the selector cannot disappear with another sort");

  const builder = read("app/builder/BuilderClient.jsx");
  assert.match(builder, /<GameweekRange from=\{gwFrom\} to=\{gwTo\}/);
  assert.match(builder, /setRange\(firstGw, Math\.min\(lastGw, firstGw \+ 3\)\)/,
    "Builder defaults to a four-gameweek optimisation window");
  assert.match(builder, /\/api\/exact-squad/);
  assert.match(builder, /optimality_proven/);
  assert.doesNotMatch(builder, /buildSquadForRange\(\{/);
  assert.match(builder, /optimiseOwnedSquadRange\(\{/);
  assert.match(builder, /mergeWeeklyDecisions\(/);
  assert.match(builder, /OPTIMISE XI/);

  const squad = read("app/squad/SquadClient.jsx");
  assert.match(squad, /<GameweekRange from=\{gwFrom\} to=\{gwTo\} min=\{firstGw\} max=\{lastGw\}/);
  assert.match(squad, /onClick=\{doOptimiseRange\}/);
  assert.match(squad, /writePlan\(applyOptimisedRangeToPlan\(shaped, rangeProjection\)\)/,
    "Squad range optimisation is one atomic editable-plan write");

  const verify = read("jobs/verify_live_system.mjs");
  assert.match(verify, /VERIFY_PROJECTION_GWS/);
  assert.match(verify, /for \(const futureGw of futureGameweeks\)/);
  assert.match(verify, /Future GW\$\{futureGw\} projections work/);
  assert.match(verify, /textRequest\("\/builder"\)/);
  assert.match(verify, /textRequest\("\/squad"\)/);
});
test("Builder pitch and candidates stack before the fixed sidebar can force horizontal overflow", () => {
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.equal((builder.match(/className="zeus-builder-workspace"/g) || []).length, 2,
    "both the loading and live Builder workspace must share the responsive layout");
  assert.match(css, /\.zeus-builder-workspace \{[\s\S]*minmax\(0, 1fr\) minmax\(320px, 380px\)/);
  assert.match(css, /@media \(max-width: 1320px\) \{[\s\S]*\.zeus-builder-workspace \{ grid-template-columns: 1fr; \}/);
});


