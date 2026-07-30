// Predicted lineups are evidence, not official team sheets.
// A named player is strong positive evidence. Omission from one unofficial XI
// is not enough to downgrade an otherwise healthy independent minutes forecast.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const norm = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[øØ]/g, "o")
  .replace(/[æÆ]/g, "ae")
  .replace(/[åÅ]/g, "a")
  .replace(/[đĐ]/g, "d")
  .replace(/[łŁ]/g, "l")
  .replace(/[ıİ]/g, "i")
  .replace(/[ğĞ]/g, "g")
  .replace(/[ßẞ]/g, "ss")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const TEAM_GROUPS = [
  ["ars", "arsenal"], ["avl", "aston villa", "villa"],
  ["bou", "bournemouth", "afc bournemouth"], ["bre", "brentford"],
  ["bha", "brighton", "brighton hove albion", "brighton and hove albion"],
  ["bur", "burnley"], ["che", "chelsea"], ["cry", "crystal palace", "palace"],
  ["eve", "everton"], ["ful", "fulham"], ["lee", "leeds", "leeds united"],
  ["liv", "liverpool"], ["mci", "man city", "manchester city"],
  ["mun", "man utd", "man united", "manchester united"],
  ["new", "newcastle", "newcastle united"],
  ["nfo", "nott m forest", "nottingham forest", "forest"],
  ["sun", "sunderland"], ["tot", "spurs", "tottenham", "tottenham hotspur"],
  ["whu", "west ham", "west ham united"],
  ["wol", "wolves", "wolverhampton", "wolverhampton wanderers"],
];
const TEAM_CANONICAL = new Map();
for (const group of TEAM_GROUPS) {
  for (const alias of group) TEAM_CANONICAL.set(norm(alias), group[0]);
}
const canonicalTeam = (value) => TEAM_CANONICAL.get(norm(value)) ?? norm(value);

function playerName(player) {
  return player?.web_name ?? player?.name ?? player?.full_name
    ?? [player?.first_name, player?.second_name].filter(Boolean).join(" ");
}

function namesFrom(value, seen = new Set()) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => namesFrom(entry, seen));
  if (typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const direct = value.web_name ?? value.player_name ?? value.full_name ?? value.name;
  const out = direct ? [direct] : [];
  for (const key of [
    "xi", "eleven", "starters", "players", "lineup", "starting_xi", "startingXI",
    "predicted_xi", "predictedXI", "names",
  ]) {
    if (value[key] !== undefined) out.push(...namesFrom(value[key], seen));
  }
  return out.filter(Boolean);
}

function lineupEntries(lineups) {
  if (!lineups || typeof lineups !== "object") return [];
  let source = lineups;
  for (const key of ["clubs", "teams", "lineups", "predictions", "data"]) {
    if (lineups[key] && typeof lineups[key] === "object") {
      source = lineups[key];
      break;
    }
  }
  if (Array.isArray(source)) {
    return source.map((value, index) => [
      value?.team ?? value?.club ?? value?.team_name ?? value?.short_name ?? String(index),
      value,
    ]);
  }
  return Object.entries(source);
}

function findClubLineup(lineups, team) {
  const aliases = new Set([
    team?.short_name, team?.name, team?.code, team?.team_name, team?.club,
    team?.fpl_id, team?.id,
  ].map(canonicalTeam).filter(Boolean));
  for (const [key, value] of lineupEntries(lineups)) {
    const candidates = [
      key, value?.team, value?.club, value?.team_name, value?.short_name,
      value?.team_code, value?.team_id, value?.fpl_team_id,
    ].map(canonicalTeam).filter(Boolean);
    if (candidates.some((candidate) => aliases.has(candidate))) return value;
  }
  return null;
}

function tokenParts(value) {
  const tokens = norm(value).split(" ").filter(Boolean);
  return {
    full: tokens.join(" "),
    last: tokens.at(-1) ?? "",
    initialLast: tokens.length > 1 ? `${tokens[0][0]} ${tokens.at(-1)}` : tokens[0] ?? "",
  };
}

function isNamed(player, names) {
  const full = [player?.first_name, player?.second_name].filter(Boolean).join(" ");
  const targets = [playerName(player), full, player?.second_name].map(tokenParts);
  const candidates = names.map(tokenParts);
  for (const target of targets) {
    for (const candidate of candidates) {
      if (!target.full || !candidate.full) continue;
      if (target.full === candidate.full) return true;
      if (target.initialLast && target.initialLast === candidate.initialLast) return true;
      if (target.last.length >= 4 && target.last === candidate.last) return true;
    }
  }
  return false;
}

function explicitlyUnavailable(forecast, player) {
  const source = norm(forecast?.minutes_source ?? forecast?.source);
  if (source === "unavailable" || forecast?.unavailable === true) return true;
  const status = String(player?.status ?? forecast?.status ?? "").toLowerCase();
  const chance = Number(
    player?.chance_of_playing_next_round
    ?? player?.chance_of_playing
    ?? forecast?.chance_of_playing_next_round
    ?? forecast?.chance_of_playing,
  );
  if (status === "s") return true;
  return ["i", "u"].includes(status) && Number.isFinite(chance) && chance <= 0;
}

export function applyLineupEvidence({ forecast, player, team, lineups, cfg = {} }) {
  const clubLineup = findClubLineup(lineups, team);
  const names = namesFrom(clubLineup);
  if (!names.length) return { ...forecast, lineup_applied: false };

  const official = Boolean(clubLineup?.official ?? lineups?.official);
  const rawConfidence = Number(clubLineup?.confidence ?? lineups?.confidence ?? 0.75);
  const confidence = official
    ? 1
    : Math.min(0.8, Math.max(0.25, Number.isFinite(rawConfidence) ? rawConfidence : 0.75));
  const named = isNamed(player, names);

  if (explicitlyUnavailable(forecast, player)) {
    return {
      ...forecast,
      lineup_applied: false,
      lineup_named: named,
      lineup_official: official,
      lineup_confidence: confidence,
      lineup_ignored_reason: "explicitly-unavailable",
    };
  }

  const ceiling = Number(cfg.pStartCeiling) || 0.98;
  const baseStart = clamp01(forecast.p_start);
  const baseCameo = clamp01(forecast.p_cameo);
  const baseAppear = Math.max(baseStart, clamp01(baseStart + baseCameo));

  // One unofficial omission is not enough to overrule the independent model.
  if (!official && !named) {
    return {
      ...forecast,
      lineup_applied: false,
      lineup_named: false,
      lineup_official: false,
      lineup_confidence: confidence,
      lineup_ignored_reason: "unofficial-omission",
    };
  }

  let pStart;
  let pAppear;
  if (official) {
    pStart = named ? ceiling : 0;
    pAppear = named ? 0.995 : Math.min(0.18, Math.max(baseCameo, 0.06));
  } else {
    const blended = (1 - confidence) * baseStart + confidence * 0.95;
    const namedFloor = Math.min(0.9, 0.72 + 0.16 * confidence);
    pStart = Math.min(ceiling, Math.max(baseStart, blended, namedFloor));
    pAppear = Math.max(pStart, (1 - confidence) * baseAppear + confidence * 0.99);
  }

  pAppear = Math.min(1, pAppear);
  const pCameo = Math.max(0, pAppear - pStart);
  const baseStartMinutes = Math.max(0, Number(forecast.exp_min_start) || 0);
  const startMinutesTarget = official && named ? 88 : 84;
  const expMinStart = named
    ? (1 - confidence) * baseStartMinutes + confidence * startMinutesTarget
    : baseStartMinutes;
  const baseP60 = clamp01(forecast.p60_given_start);
  const p60GivenStart = named
    ? Math.min(0.99, (1 - confidence) * baseP60 + confidence * 0.92)
    : baseP60;
  const p60 = pStart * p60GivenStart + pCameo * (Number(cfg.earlySubShare) || 0);

  return {
    ...forecast,
    p_start: +clamp01(pStart).toFixed(4),
    p_cameo: +clamp01(pCameo).toFixed(4),
    p60: +clamp01(p60).toFixed(4),
    p60_given_start: +clamp01(p60GivenStart).toFixed(4),
    exp_min_start: +expMinStart.toFixed(2),
    lineup_applied: true,
    lineup_named: named,
    lineup_official: official,
    lineup_confidence: confidence,
  };
}

export const __lineupEvidenceTest = { canonicalTeam, findClubLineup, isNamed, namesFrom };
