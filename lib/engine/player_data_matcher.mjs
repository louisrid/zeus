// Deterministic player-row matching for external expected-metrics datasets.
// A missing match is safer than attaching another footballer's history.

const text = (value) => String(value ?? "").trim();

export function normalisePlayerText(value) {
  return text(value)
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
}

const TEAM_ALIAS = new Map(Object.entries({
  "man city": "manchester city",
  "manchester city fc": "manchester city",
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester united fc": "manchester united",
  "spurs": "tottenham hotspur",
  "tottenham": "tottenham hotspur",
  "nott m forest": "nottingham forest",
  "newcastle": "newcastle united",
  "wolves": "wolverhampton wanderers",
  "brighton": "brighton and hove albion",
  "west ham": "west ham united",
  "leeds": "leeds united",
}));

export function normaliseTeamText(value) {
  const n = normalisePlayerText(value);
  return TEAM_ALIAS.get(n) || n;
}

const rowName = (row) => row?.player_name ?? row?.player ?? row?.name ?? row?.full_name ?? row?.web_name ?? "";
const rowTeam = (row) => row?.team_title ?? row?.team_name ?? row?.team ?? row?.club ?? row?.short_name ?? "";
const playerName = (player) => {
  const full = [player?.first_name, player?.second_name].filter(Boolean).join(" ").trim();
  return player?.full_name ?? (full || null) ?? player?.name ?? player?.web_name ?? player?.second_name ?? "";
};
const playerTeam = (player) => player?.team_name ?? player?.team_title ?? player?.team ?? player?.club ?? player?.short_name ?? "";

function compactInitialLast(value) {
  const tokens = normalisePlayerText(value).split(" ").filter(Boolean);
  if (!tokens.length) return "";
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0][0]} ${tokens[tokens.length - 1]}`;
}

function teamVariants(value) {
  const raw = String(value ?? "");
  const pieces = raw.split(/[,/;|]/).map((x) => normaliseTeamText(x)).filter(Boolean);
  const whole = normaliseTeamText(raw);
  return [...new Set([whole, ...pieces].filter(Boolean))];
}

function asRows(source) {
  if (!source) return [];
  if (source instanceof Map) return [...source.values()].flatMap((v) => Array.isArray(v) ? v : [v]);
  if (Array.isArray(source)) return source;
  if (typeof source === "object") return Object.values(source).flatMap((v) => Array.isArray(v) ? v : [v]);
  return [];
}

const cache = new WeakMap();

function indexSource(source) {
  if (source && typeof source === "object" && cache.has(source)) return cache.get(source);
  const rows = asRows(source).filter((row) => row && typeof row === "object");
  const byFplId = new Map();
  const byNameTeam = new Map();
  const byName = new Map();
  const byInitialTeam = new Map();
  const byInitial = new Map();

  const add = (map, key, row) => {
    if (!key) return;
    const existing = map.get(key);
    if (!existing) map.set(key, row);
    else if (existing !== row) map.set(key, null); // ambiguity is safer than a false match
  };

  for (const row of rows) {
    const explicitFplId = Number(row.fpl_id ?? row.fpl_element ?? row.element_id ?? row.fpl_player_id);
    if (Number.isFinite(explicitFplId)) add(byFplId, explicitFplId, row);

    const name = normalisePlayerText(rowName(row));
    const initialLast = compactInitialLast(rowName(row));
    const teams = teamVariants(rowTeam(row));
    for (const team of teams) {
      add(byNameTeam, `${name}|${team}`, row);
      add(byInitialTeam, `${initialLast}|${team}`, row);
    }
    add(byName, name, row);
    add(byInitial, initialLast, row);
  }

  const index = { byFplId, byNameTeam, byName, byInitialTeam, byInitial };
  if (source && typeof source === "object") cache.set(source, index);
  return index;
}

/**
 * Match order:
 *   1. caller-supplied direct row;
 *   2. explicit FPL id;
 *   3. exact full name at the same club;
 *   4. unique initial-plus-surname at the same club;
 *   5. unique exact full name across clubs, for transfers;
 *   6. unique initial-plus-surname across clubs, for transfers/name variants.
 *
 * First-name-only and surname-only matching are deliberately forbidden. They
 * previously attached unrelated history to new players who happened to share
 * one token with somebody from another club.
 */
export function matchExpectedMetricsRow({ player, direct = null, source = null }) {
  if (direct && typeof direct === "object") return direct;
  if (!player || !source) return null;
  const index = indexSource(source);
  const id = Number(player.fpl_id ?? player.player_id ?? player.id ?? player.element);
  if (Number.isFinite(id)) {
    const byId = index.byFplId.get(id);
    if (byId) return byId;
  }

  const rawName = playerName(player);
  const name = normalisePlayerText(rawName);
  const initialLast = compactInitialLast(rawName);
  const teams = teamVariants(playerTeam(player));

  for (const team of teams) {
    const exact = index.byNameTeam.get(`${name}|${team}`);
    if (exact) return exact;
    const initial = index.byInitialTeam.get(`${initialLast}|${team}`);
    if (initial) return initial;
  }

  const exactTransfer = index.byName.get(name);
  if (exactTransfer) return exactTransfer;
  const initialTransfer = index.byInitial.get(initialLast);
  return initialTransfer || null;
}
