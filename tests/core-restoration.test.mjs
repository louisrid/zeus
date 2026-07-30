import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyResolvedTeams } from "../lib/resolved_teams.mjs";
import { shrinkConditionalMinutes } from "../lib/engine/layer3_minutes.mjs";
import { attachPlayerRole } from "../lib/engine/player_roles.mjs";
import { buildScorer } from "../lib/solver/score.mjs";
import { buildBrief } from "../lib/server/fpl_brief_api.mjs";

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

test("the stable OpenWeb brief uses the team recorded by the projection generation", () => {
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
  assert.match(projectionJob, /Math\.max\(8, Number\(process\.env\.PROJECTION_GWS \|\| 8\)\)/);
  for (const file of [
    ".github/workflows/projections-run.yml",
    ".github/workflows/presser-pull.yml",
    ".github/workflows/zeus-core-restoration-v2.yml",
  ]) {
    assert.match(read(file), /PROJECTION_GWS:\s*['\"]?8['\"]?/,
      `${file} must generate the restored future horizon`);
  }

  const players = read("components/PlayerControls.jsx");
  assert.match(players, /\{showGameweekRange && setRange && \(/);
  assert.ok(!/sort\.key === "XPTS"/.test(players), "the selector cannot disappear with another sort");

  const builder = read("app/builder/BuilderClient.jsx");
  assert.match(builder, /<GameweekRange from=\{gwFrom\} to=\{gwTo\}/);
  assert.match(builder, /setRange\(firstGw, Math\.min\(lastGw, firstGw \+ 3\)\)/,
    "Builder defaults to a four-gameweek optimisation window");
  assert.match(builder, /optimiseSquad\(squad, xpOverHorizon/);
  assert.match(builder, />\s*OPTIMISE XI\s*</);

  const squad = read("app/squad/SquadClient.jsx");
  assert.match(squad, /onClick=\{doOptimise\}/);
  assert.match(squad, /OPTIMISE GW\{gw\}/);
  assert.match(squad, /writePlan\(\{[\s\S]*startingIds[\s\S]*captain: r\.captain[\s\S]*vice: r\.vice/,
    "Squad optimisation is one atomic editable-plan write");

  const workflow = read(".github/workflows/zeus-core-restoration-v2.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /node jobs\/verify_live_system\.mjs/);
  const verify = read("jobs/verify_live_system.mjs");
  assert.match(verify, /Future GW\$\{futureGw\} projections work/);
  assert.match(verify, /textRequest\("\/builder"\)/);
  assert.match(verify, /textRequest\("\/squad"\)/);
});
