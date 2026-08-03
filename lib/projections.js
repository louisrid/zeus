"use client";

import LINEUPS from "../config/lineups.json";
import { sb } from "./data";
import { buildExternalProjectionModel } from "./external_xpts.mjs";
import { buildLineupGate } from "./lineup-xpts.mjs";

/*
 * External-xPTS mode with one predicted-line-up gate.
 *
 * Imported values remain the raw source. A player named in config/lineups.json keeps that value and has
 * start probability 1.0. Every other player has effective xPTS and start probability 0.0 until a newer
 * predicted-line-up snapshot is supplied. The gate is applied once here and reused by every browser page.
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

  const teams = Object.values(core.teamById || {});
  const lineupGate = buildLineupGate({
    clubs: LINEUPS.clubs || [],
    players: core.players || [],
    teams,
  });
  const model = buildExternalProjectionModel(core.players || [], {
    currentGw: core.currentGw,
    lastSeasonPointsByFpl,
    lineupStartingIds: lineupGate.active ? lineupGate.startingIds : null,
    lineupGateReport: lineupGate.report,
  });

  // These explicit keys are intentional. Static repository guards can verify every accessor used by pages.
  return {
    ...model,
    gw: model.gw,
    envByTeam: model.envByTeam,
    perGw: model.perGw,
    startProbOf: model.startProbOf,
    gateOpen: model.gateOpen,
    lastSeasonPoints: model.lastSeasonPoints,
    lineupGate: model.lineupGate,
  };
}

export { provenanceLine } from "./solver/score.mjs";
