import LINEUPS from "./lineups-config.generated.mjs";
import { buildLineupGate } from "../lineup-xpts.mjs";

export function serverLineupGate(players = [], teams = []) {
  return buildLineupGate({ clubs: LINEUPS.clubs || [], players, teams });
}
