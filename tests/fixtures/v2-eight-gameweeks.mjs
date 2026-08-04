const SERIES = {
  short: [8, 1, 1, 1, 1, 1, 1, 1],
  balanced: [4.5, 4.5, 4.5, 4.5, 3, 3, 3, 3],
  long: [2, 3, 4, 5, 6, 7, 8, 9],
};

export function makeV2EightGameweekFixture() {
  const players = [];
  const projections = new Map();
  const shapes = [["GKP", 1, 4.0], ["DEF", 2, 4.0], ["MID", 2, 4.5], ["FWD", 1, 4.5]];
  let id = 1;
  for (let club = 1; club <= 12; club++) {
    for (const [position, count, basePrice] of shapes) {
      for (let slot = 0; slot < count; slot++) {
        const positionIndex = { GKP: 0, DEF: 1, MID: 2, FWD: 3 }[position];
        const style = ["short", "balanced", "long"][(club + slot + positionIndex) % 3];
        const price = +(basePrice + (style === "short" ? 1.2 : style === "balanced" ? .6 : 0) + slot * .1).toFixed(1);
        const player = { fpl_id: id, id, team_id: club, team: `T${club}`, position,
          web_name: `${position}-${club}-${slot}-${style}`, price, status: "a", style };
        players.push(player);
        projections.set(id, new Map(SERIES[style].map((value, index) => [index + 1, value + (club % 4) * .03])));
        id++;
      }
    }
  }
  return {
    players,
    gameweeks: Array.from({ length: 8 }, (_, index) => index + 1),
    projections,
    scoreForGw: (player, gw) => projections.get(player.fpl_id)?.get(gw) ?? null,
  };
}
