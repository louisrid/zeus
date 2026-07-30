// Predicted lineups are evidence, not official team sheets.
// This module blends one or more named XIs into the base minutes model before simulation.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const norm = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function playerName(player) {
  return player?.web_name ?? player?.name ?? player?.full_name
    ?? [player?.first_name, player?.second_name].filter(Boolean).join(" ");
}

function namesFrom(value) {
  if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" ? entry : playerName(entry)).filter(Boolean);
  if (!value || typeof value !== "object") return [];
  for (const key of ["xi", "eleven", "starters", "players", "lineup", "starting_xi", "startingXI"]) {
    if (Array.isArray(value[key])) return namesFrom(value[key]);
  }
  return [];
}

function lineupEntries(lineups) {
  if (!lineups || typeof lineups !== "object") return {};
  return lineups.clubs ?? lineups.teams ?? lineups.lineups ?? {};
}

function findClubLineup(lineups, team) {
  const entries = lineupEntries(lineups);
  if (!entries || typeof entries !== "object") return null;
  const aliases = [team?.short_name, team?.name, team?.code, team?.fpl_id, team?.id]
    .map(norm).filter(Boolean);
  for (const [key, value] of Object.entries(entries)) {
    const keyNorm = norm(key);
    const valueTeam = norm(value?.team ?? value?.club ?? value?.team_name ?? value?.short_name);
    if (aliases.includes(keyNorm) || (valueTeam && aliases.includes(valueTeam))) return value;
  }
  return null;
}

function isNamed(player, names) {
  const target = norm(playerName(player));
  if (!target) return false;
  const targetTokens = target.split(" ").filter(Boolean);
  const targetLast = targetTokens.at(-1) ?? "";
  const targetInitialLast = targetTokens.length > 1 ? `${targetTokens[0][0]} ${targetLast}` : target;
  return names.some((name) => {
    const candidate = norm(name);
    if (!candidate) return false;
    const tokens = candidate.split(" ").filter(Boolean);
    const last = tokens.at(-1) ?? "";
    const initialLast = tokens.length > 1 ? `${tokens[0][0]} ${last}` : candidate;
    return candidate === target || initialLast === targetInitialLast || (last === targetLast && last.length >= 5);
  });
}

export function applyLineupEvidence({ forecast, player, team, lineups, cfg = {} }) {
  const clubLineup = findClubLineup(lineups, team);
  const names = namesFrom(clubLineup);
  if (!names.length) return { ...forecast, lineup_applied: false };

  const official = Boolean(clubLineup?.official ?? lineups?.official);
  const rawConfidence = Number(clubLineup?.confidence ?? lineups?.confidence ?? 0.5);
  const confidence = official ? 1 : Math.min(0.5, Math.max(0, Number.isFinite(rawConfidence) ? rawConfidence : 0.5));
  const named = isNamed(player, names);
  const ceiling = Number(cfg.pStartCeiling) || 0.98;
  const baseStart = clamp01(forecast.p_start);
  const startTarget = official ? (named ? ceiling : 0) : (named ? 0.95 : 0.05);
  const pStart = Math.min(ceiling, (1 - confidence) * baseStart + confidence * startTarget);

  const baseAppear = Math.max(baseStart, clamp01(baseStart + (forecast.p_cameo ?? 0)));
  const appearTarget = named ? 0.99 : (official ? 0.18 : 0.45);
  const pAppear = Math.max(pStart, Math.min(1, (1 - confidence) * baseAppear + confidence * appearTarget));
  const pCameo = Math.max(0, pAppear - pStart);

  const baseStartMinutes = Math.max(0, Number(forecast.exp_min_start) || 0);
  const startMinutesTarget = official && named ? 88 : named ? 82 : baseStartMinutes;
  const expMinStart = named
    ? (1 - confidence) * baseStartMinutes + confidence * startMinutesTarget
    : baseStartMinutes;
  const p60GivenStart = named
    ? Math.min(0.99, (1 - confidence) * clamp01(forecast.p60_given_start) + confidence * 0.9)
    : clamp01(forecast.p60_given_start);
  const p60 = pStart * p60GivenStart + pCameo * (Number(cfg.earlySubShare) || 0);

  return {
    ...forecast,
    p_start: +pStart.toFixed(4),
    p_cameo: +pCameo.toFixed(4),
    p60: +p60.toFixed(4),
    p60_given_start: +p60GivenStart.toFixed(4),
    exp_min_start: +expMinStart.toFixed(2),
    lineup_applied: true,
    lineup_named: named,
    lineup_official: official,
    lineup_confidence: confidence,
  };
}
