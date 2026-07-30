export function buildSystemHealth({ brief, deploymentCommit = null, deploymentEnvironment = null, openwebAuthRequired = false } = {}) {
  const players = Array.isArray(brief?.players) ? brief.players : [];
  const requiredFields = ["name", "team", "position", "xpts", "expected_minutes", "start_probability"];
  const fieldFailures = players.slice(0, 50).filter((player) =>
    requiredFields.some((field) => player?.[field] === undefined || player?.[field] === null));
  const projectionCount = Number(brief?.projection_count) || 0;
  const ready = Boolean(brief?.ok && projectionCount >= 500 && players.length && !fieldFailures.length);
  return {
    ok: ready,
    status: ready ? "ok" : "error",
    service: "Zeus",
    generated_at: new Date().toISOString(),
    deployment_commit: deploymentCommit || null,
    deployment_environment: deploymentEnvironment || null,
    database_connected: Boolean(brief?.ok),
    players_page_data_ready: projectionCount >= 500,
    openweb_brief_ready: ready,
    openweb_auth_required: Boolean(openwebAuthRequired),
    gameweek: Number(brief?.gw ?? brief?.gameweek) || null,
    projection_count: projectionCount,
    latest_projection_run: brief?.latest_projection_run || null,
    model_version: brief?.model_version || null,
    stale_rows_excluded: Number(brief?.stale_rows_excluded) || 0,
    top_player: players[0] ? {
      name: players[0].name,
      team: players[0].team,
      xpts: players[0].xpts,
    } : null,
    required_response_fields: requiredFields,
    field_failures: fieldFailures.length,
    warnings: Array.isArray(brief?.warnings) ? brief.warnings : [],
  };
}
