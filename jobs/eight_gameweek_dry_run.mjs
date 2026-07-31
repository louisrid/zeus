import { fallbackGoalEnvironmentForTeams } from "../lib/engine/layer0_market.mjs";
import { generateProjectionGeneration } from "../lib/eight_gameweek_pipeline.mjs";
import { localProjectionFixture } from "../lib/local_projection_fixture.mjs";

const data = localProjectionFixture();
const teamById = new Map(data.teams.map((team) => [team.id, team]));
const playersByTeam = new Map();
for (const player of data.players) {
  const group = playersByTeam.get(player.team_id) || [];
  group.push(player);
  playersByTeam.set(player.team_id, group);
}

const generation = await generateProjectionGeneration({
  ...data,
  computedAt: "2026-07-31T12:00:00.000Z",
  baseModelVersion: "eight-gameweek-local-dry-run",
  projectFixture: ({ fixture }) => {
    const home = teamById.get(fixture.home_team);
    const away = teamById.get(fixture.away_team);
    const goalEnvironment = fallbackGoalEnvironmentForTeams({
      homeTeam: home,
      awayTeam: away,
      leagueTeams: data.teams,
      leagueMeanGoals: 2.8,
      homeAdvantage: 1.13,
    });
    if (!goalEnvironment) throw new Error(`fixture ${fixture.id} has no fallback goal environment`);
    const rows = [];
    for (const [teamId, lambdaTeam, lambdaOpponent] of [
      [fixture.home_team, goalEnvironment.lambda_home, goalEnvironment.lambda_away],
      [fixture.away_team, goalEnvironment.lambda_away, goalEnvironment.lambda_home],
    ]) {
      for (const player of playersByTeam.get(teamId) || []) {
        const base = { GKP: 2.8, DEF: 3.1, MID: 3.4, FWD: 3.6 }[player.position] || 3;
        rows.push({
          player_id: player.id,
          ep_mean: Number((base * (0.8 + lambdaTeam / (lambdaTeam + lambdaOpponent) * 0.4)).toFixed(4)),
          lambda_team: lambdaTeam,
          lambda_opponent: lambdaOpponent,
          odds_backed: false,
        });
      }
    }
    return rows;
  },
});

const result = {
  mode: "dry-run",
  database_mutations: 0,
  target_gameweeks: generation.targetGws,
  selected_fixtures: generation.fixtures.length,
  generation_timestamp: generation.computedAt,
  model_version: generation.modelVersion,
  expected_active_players: generation.players.length,
  actual_unique_players: new Set(generation.rows.map((row) => row.player_id)).size,
  total_rows: generation.rows.length,
  rows_by_gameweek: Object.fromEntries(generation.validation.gameweeks.map((row) => [row.gw, row.rows])),
  malformed_fixtures: generation.fixtureAudit.warnings,
  validation: generation.validation,
};
console.log(JSON.stringify(result, null, 2));
