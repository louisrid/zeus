const finiteId = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

const NULLISH_TOKENS = new Set(["", "none", "null", "nil", "undefined", "nan", "n/a", "na", "-", "[]"]);

export function normalisePlayerReference(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isNullishReference(raw) {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string") return NULLISH_TOKENS.has(raw.trim().toLowerCase());
  if (typeof raw === "object") {
    const name = String(raw.name ?? raw.web_name ?? "").trim();
    return !name || NULLISH_TOKENS.has(name.toLowerCase());
  }
  return false;
}

function aliasesFor(player) {
  const values = [
    player?.web_name,
    player?.name,
    player?.second_name,
    [player?.first_name, player?.second_name].filter(Boolean).join(" "),
  ];
  return [...new Set(values.map(normalisePlayerReference).filter(Boolean))];
}

function teamAliasesFor(player) {
  return [...new Set([
    player?.team,
    player?.team_name,
    player?.team_short_name,
    player?.short_name,
  ].map(normalisePlayerReference).filter(Boolean))];
}

function canonicalPlayer(player) {
  return {
    fpl_id: finiteId(player?.fpl_id ?? player?.element ?? player?.id),
    web_name: player?.web_name ?? player?.name ?? null,
    team: player?.team ?? player?.team_name ?? null,
    team_id: Number.isFinite(Number(player?.team_id)) ? Number(player.team_id) : null,
    position: player?.position ?? null,
    price: Number.isFinite(Number(player?.price)) ? Number(player.price) : null,
  };
}

function parseReference(raw) {
  if (typeof raw === "string") {
    const value = raw.trim();
    const qualified = value.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (qualified) return { name: qualified[1].trim(), team: qualified[2].trim() };
    return { name: value, team: null };
  }
  if (raw && typeof raw === "object") {
    return {
      name: String(raw.name ?? raw.web_name ?? "").trim(),
      team: raw.team === null || raw.team === undefined ? null : String(raw.team).trim(),
    };
  }
  return { name: "", team: null };
}

export function resolvePlayerReferences(players = [], rawReferences = [], { label = "player" } = {}) {
  const references = (Array.isArray(rawReferences) ? rawReferences : [])
    .filter((raw) => !isNullishReference(raw));
  const resolved = [];
  const errors = [];
  const rows = (players || []).map((player) => ({
    player,
    aliases: aliasesFor(player),
    teams: teamAliasesFor(player),
  }));

  for (const raw of references) {
    const reference = parseReference(raw);
    const normalisedName = normalisePlayerReference(reference.name);
    const normalisedTeam = normalisePlayerReference(reference.team);
    if (!normalisedName) {
      errors.push(`Blank ${label} name was supplied.`);
      continue;
    }

    let matches = rows.filter((row) => row.aliases.includes(normalisedName));
    if (normalisedTeam) {
      const teamMatches = matches.filter((row) => row.teams.includes(normalisedTeam));
      // Keep a single unambiguous name match even when the team qualifier is unrecognised.
      if (teamMatches.length > 0 || matches.length !== 1) matches = teamMatches;
    }

    if (matches.length === 0) {
      const suffix = reference.team ? ` for team ${reference.team}` : "";
      errors.push(`Unknown ${label} ${reference.name}${suffix}.`);
      continue;
    }
    if (matches.length > 1) {
      const candidates = matches.map(({ player }) => {
        const canonical = canonicalPlayer(player);
        return `${canonical.web_name} (${canonical.team || "unknown team"}, ID ${canonical.fpl_id})`;
      }).join(", ");
      errors.push(`Ambiguous ${label} ${reference.name}: ${candidates}. Add a team qualifier.`);
      continue;
    }

    const canonical = canonicalPlayer(matches[0].player);
    if (!canonical.fpl_id) {
      errors.push(`Resolved ${label} ${reference.name} has no valid FPL ID.`);
      continue;
    }
    resolved.push({
      requested_name: reference.name,
      requested_team: reference.team,
      ...canonical,
    });
  }

  const byId = new Map();
  for (const row of resolved) if (!byId.has(row.fpl_id)) byId.set(row.fpl_id, row);
  const unique = [...byId.values()];
  return {
    ok: errors.length === 0,
    errors,
    ids: unique.map((row) => row.fpl_id),
    players: unique,
  };
}

export function reconcilePlayerIdsAndNames({
  players = [],
  ids = [],
  names = [],
  label = "excluded player",
} = {}) {
  const canonicalIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
  const resolution = resolvePlayerReferences(players, names, { label });
  if (!resolution.ok) return { ok: false, error: resolution.errors.join(" "), resolution };
  const resolvedIds = [...resolution.ids].sort((a, b) => a - b);

  if (canonicalIds.length && resolvedIds.length
    && JSON.stringify(canonicalIds) !== JSON.stringify(resolvedIds)) {
    return {
      ok: false,
      error: `The supplied ${label} IDs do not match the supplied names. IDs: ${canonicalIds.join(",")}; resolved names: ${resolvedIds.join(",")}.`,
      resolution,
    };
  }

  const finalIds = canonicalIds.length ? canonicalIds : resolvedIds;
  const playerById = new Map((players || []).map((player) => [
    finiteId(player?.fpl_id ?? player?.element ?? player?.id),
    player,
  ]));
  const unknownIds = finalIds.filter((id) => !playerById.has(id));
  if (unknownIds.length) {
    return { ok: false, error: `Unknown ${label} IDs: ${unknownIds.join(",")}.`, resolution };
  }

  return {
    ok: true,
    ids: finalIds,
    players: finalIds.map((id) => canonicalPlayer(playerById.get(id))),
    resolution: resolution.players,
    source: canonicalIds.length && resolvedIds.length
      ? "excluded_player_ids+excluded_player_names"
      : (canonicalIds.length ? "excluded_player_ids" : (resolvedIds.length ? "excluded_player_names" : "none")),
  };
}
