import { readFileSync } from "node:fs";

export function localProjectionFixture() {
  const snapshot = JSON.parse(readFileSync(new URL("../tests/fpl-players.json", import.meta.url), "utf8"));
  const players = snapshot.players.map((player) => ({
    ...player,
    id: Number(player.fpl_id),
    archive: false,
    active: true,
  }));
  const teams = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    fpl_id: index + 1,
    name: `Team ${index + 1}`,
    short_name: `T${String(index + 1).padStart(2, "0")}`,
    strength: 900 + (index + 1) * 20,
    archive: false,
  }));

  const fixtures = [];
  let rotation = teams.map((team) => team.id);
  let fixtureId = 1;
  for (let gw = 1; gw <= 8; gw += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const left = rotation[index];
      const right = rotation[rotation.length - 1 - index];
      const home = (gw + index) % 2 ? left : right;
      const away = home === left ? right : left;
      fixtures.push({
        id: fixtureId,
        fpl_id: fixtureId,
        gw,
        home_team: home,
        away_team: away,
        season: "2026-27",
        competition: "PL",
        finished: false,
      });
      fixtureId += 1;
    }
    rotation = [rotation[0], rotation.at(-1), ...rotation.slice(1, -1)];
  }

  fixtures.push({
    id: 1000005,
    fpl_id: 1000005,
    gw: 1,
    home_team: 1,
    away_team: null,
    season: "2025-26",
    competition: "PL",
    finished: true,
  });
  const gameweeks = Array.from({ length: 8 }, (_, index) => ({ gw: index + 1, finished: false }));
  return { teams, players, fixtures, gameweeks, projections: [] };
}
