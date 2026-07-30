/* Resolve a player's current club from the freshest evidence available.
 *
 * The players table can lag a transfer by one pull. The projection job already records the team it actually
 * simulated in quantiles.diagnostics.resolved_team_id, and the current predicted-lineup snapshot can be even
 * fresher. Every surface must use that same resolved team for fixtures, club limits and labels, or a player
 * can be simulated for Chelsea while the website still prices and displays him as Crystal Palace.
 */
const finiteTeamId = (value) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export function resolvedTeamIdFromProjection(row) {
  return finiteTeamId(row?.quantiles?.diagnostics?.resolved_team_id);
}

export function applyResolvedTeams({ players = [], teamById = {}, projections = new Map(), lineupOverrides = new Map() } = {}) {
  const changed = [];
  for (const player of players) {
    const storedTeamId = finiteTeamId(player.team_id);
    const projectedTeamId = resolvedTeamIdFromProjection(projections?.get?.(player.fpl_id));
    const lineupTeamId = finiteTeamId(lineupOverrides?.get?.(player.fpl_id));
    // Current lineup evidence is the freshest. Projection diagnostics are the fallback when no lineup
    // transfer override exists, then the stored players row.
    const resolvedTeamId = lineupTeamId ?? projectedTeamId ?? storedTeamId;
    const team = teamById?.[resolvedTeamId];
    if (!resolvedTeamId || !team || team.archive === true) continue;

    if (storedTeamId !== resolvedTeamId) {
      changed.push({
        fpl_id: player.fpl_id,
        name: player.web_name || player.name || String(player.fpl_id),
        from: storedTeamId,
        to: resolvedTeamId,
        source: lineupTeamId ? "lineup" : "projection",
      });
      player.db_team_id = storedTeamId;
      player.team_resolution = lineupTeamId ? "lineup" : "projection";
    }
    player.team_id = resolvedTeamId;
    player.team = team.short_name || team.name || player.team;
  }
  return changed;
}
