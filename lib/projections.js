"use client";

import { sb } from "./data";
import { buildExternalProjectionModel } from "./external_xpts.mjs";

/*
 * Temporary external-xPTS mode.
 *
 * This loader deliberately does not read projections, minutes_forecasts, odds, line-ups, tuning or
 * calibration. The imported xPTS values are returned exactly as supplied. Imported minutes are exposed
 * separately for display and filtering, but are never multiplied into, substituted for or otherwise used
 * to alter xPTS.
 */
export async function loadModel(core) {
  const lastSeasonPointsByFpl = new Map();
  try {
    const { data, error } = await sb()
      .from("player_prior_season")
      .select("player_id, points");
    if (!error) {
      const fplByInternalId = new Map((core.players || []).map((player) => [Number(player.id), Number(player.fpl_id)]));
      for (const row of data || []) {
        const fplId = fplByInternalId.get(Number(row.player_id));
        const points = Number(row.points);
        if (fplId && Number.isFinite(points) && points > 0) lastSeasonPointsByFpl.set(fplId, points);
      }
    }
  } catch {
    // X£ can be blank without affecting external xPTS.
  }

  return buildExternalProjectionModel(core.players || [], {
    currentGw: core.currentGw,
    lastSeasonPointsByFpl,
  });
}

export { provenanceLine } from "./solver/score.mjs";
