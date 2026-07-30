// Deterministic player-row matching for external expected-metrics datasets.
// The engine must not discard established-player data because one feed uses
// "B. Fernandes" while another uses "Bruno Fernandes".

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

function firstToken(value) {
  return normalisePlayerText(value).split(" ").filter(Boolean)[0] ?? "";
}

function surname(value) {
  const tokens = normalisePlayerText(value).split(" ").filter(Boolean);
  return tokens[tokens.length - 1] ?? "";
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
  const byFirstTeam = new Map();
  const byFirst = new Map();
  const bySurnameTeam = new Map();
  const bySurname = new Map();

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
    const team = normalisePlayerText(rowTeam(row));
    add(byNameTeam, `${name}|${team}`, row);
    add(byName, name, row);
    add(byInitialTeam, `${compactInitialLast(rowName(row))}|${team}`, row);
    add(byInitial, compactInitialLast(rowName(row)), row);
    add(byFirstTeam, `${firstToken(rowName(row))}|${team}`, row);
    add(byFirst, firstToken(rowName(row)), row);
    add(bySurnameTeam, `${surname(rowName(row))}|${team}`, row);
    add(bySurname, surname(rowName(row)), row);
  }

  const index = { byFplId, byNameTeam, byName, byInitialTeam, byInitial, byFirstTeam, byFirst, bySurnameTeam, bySurname };
  if (source && typeof source === "object") cache.set(source, index);
  return index;
}

/**
 * Prefer the caller's direct lookup, then use explicit FPL id and conservative
 * name/team aliases. Ambiguous matches deliberately return null.
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

  const name = normalisePlayerText(playerName(player));
  const team = normalisePlayerText(playerTeam(player));
  const candidates = [
    index.byNameTeam.get(`${name}|${team}`),
    index.byInitialTeam.get(`${compactInitialLast(playerName(player))}|${team}`),
    index.byInitial.get(compactInitialLast(playerName(player))),
    index.byFirstTeam.get(`${firstToken(playerName(player))}|${team}`),
    index.bySurnameTeam.get(`${surname(playerName(player))}|${team}`),
    index.bySurname.get(surname(playerName(player))),
    index.byName.get(name),
    index.byFirst.get(firstToken(playerName(player))),
  ];
  return candidates.find(Boolean) ?? null;
}
