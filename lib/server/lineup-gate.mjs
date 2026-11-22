import LINEUPS from "./lineups-config.generated.mjs";
import { buildLineupGate } from "../lineup-xpts.mjs";

export function serverLineupGate(players = [], teams = [], nextGameweek = null) {
  return buildLineupGate({ clubs: LINEUPS.clubs || [], players, teams, snapshotGameweek: LINEUPS.gameweek, snapshotDeadline: LINEUPS.deadline_utc, nextGameweek });
}
