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


// Canonical club aliases. Keyed by the FPL short code. Covers full names,
// nicknames and the abbreviations people actually type. Unknown clubs still
// resolve through the dynamic aliases below, so this list never blocks a team.
const TEAM_ALIASES = {
  ARS: ["arsenal", "gunners", "ars"],
  AVL: ["aston villa", "villa", "avl", "ast"],
  BOU: ["bournemouth", "afc bournemouth", "cherries", "bou", "bmo"],
  BRE: ["brentford", "bees", "bre"],
  BHA: ["brighton", "brighton and hove albion", "brighton hove albion", "seagulls", "bha", "bri"],
  BUR: ["burnley", "clarets", "bur"],
  CHE: ["chelsea", "blues", "che"],
  CRY: ["crystal palace", "palace", "cry", "cpl"],
  EVE: ["everton", "toffees", "eve"],
  FUL: ["fulham", "cottagers", "ful"],
  LEE: ["leeds", "leeds united", "lee"],
  LEI: ["leicester", "leicester city", "foxes", "lei"],
  LIV: ["liverpool", "reds", "liv"],
  MCI: ["manchester city", "man city", "city", "mci", "mcy"],
  MUN: ["manchester united", "man united", "man utd", "united", "mun", "manu", "mu"],
  NEW: ["newcastle", "newcastle united", "magpies", "toon", "new", "nwc"],
  NFO: ["nottingham forest", "notts forest", "forest", "nfo", "nof"],
  SOU: ["southampton", "saints", "sou"],
  SUN: ["sunderland", "black cats", "sun"],
  TOT: ["tottenham", "tottenham hotspur", "spurs", "tot", "thfc"],
  WHU: ["west ham", "west ham united", "hammers", "whu", "wham"],
  WOL: ["wolves", "wolverhampton", "wolverhampton wanderers", "wol"],
  IPS: ["ipswich", "ipswich town", "tractor boys", "ips"],
  COV: ["coventry", "coventry city", "sky blues", "cov"],
};

const TEAM_LOOKUP = new Map();
for (const [code, aliases] of Object.entries(TEAM_ALIASES)) {
  TEAM_LOOKUP.set(normalisePlayerReference(code), code);
  for (const alias of aliases) TEAM_LOOKUP.set(normalisePlayerReference(alias), code);
}

function canonicalTeamCode(value) {
  const key = normalisePlayerReference(value);
  return key ? (TEAM_LOOKUP.get(key) || null) : null;
}

const tokensOf = (value) => normalisePlayerReference(value).split(" ").filter(Boolean);

// "n williams" should match "neco williams": a single-letter token is an initial.
function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}

function tokenSetCovers(outer, inner) {
  const pool = [...outer];
  for (const token of inner) {
    const hit = pool.findIndex((candidate) => tokensMatch(candidate, token));
    if (hit === -1) return false;
    pool.splice(hit, 1);
  }
  return true;
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
  const first = player?.first_name ?? null;
  const second = player?.second_name ?? null;
  const values = [
    player?.web_name,
    player?.name,
    player?.full_name,
    second,
    [first, second].filter(Boolean).join(" "),
    // "J.Pedro" style entries become "j pedro"; also expose the bare surname
    // so "Pedro" and "Mac Allister" resolve without the first name.
    String(player?.web_name ?? "").split(/[.\s]+/).filter(Boolean).slice(-1)[0],
  ];
  return [...new Set(values.map(normalisePlayerReference).filter(Boolean))];
}

function teamAliasesFor(player) {
  const raw = [player?.team, player?.team_name, player?.team_short_name, player?.short_name];
  const out = new Set(raw.map(normalisePlayerReference).filter(Boolean));
  for (const value of raw) {
    const code = canonicalTeamCode(value);
    if (!code) continue;
    out.add(normalisePlayerReference(code));
    for (const alias of TEAM_ALIASES[code]) out.add(normalisePlayerReference(alias));
  }
  return [...out];
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

    // Tiered matching. Each tier is tried in order and the first tier that
    // produces hits wins, so a precise match always beats a looser one.
    const asId = /^[0-9]+$/.test(normalisedName) ? Number(normalisedName) : null;
    const queryTokens = tokensOf(reference.name);
    const squashed = normalisedName.replace(/ /g, "");

    const tiers = asId
      ? [(row) => canonicalPlayer(row.player).fpl_id === asId]
      : [
        // 1. exact alias
        (row) => row.aliases.includes(normalisedName),
        // 2. spacing variant: "MacAllister" vs "Mac Allister"
        (row) => row.aliases.some((alias) => alias.replace(/ /g, "") === squashed),
        // 3. same token set, initials allowed: "N.Williams" vs "Neco Williams"
        (row) => row.aliases.some((alias) => {
          const aliasTokens = tokensOf(alias);
          return aliasTokens.length === queryTokens.length
            && tokenSetCovers(aliasTokens, queryTokens)
            && tokenSetCovers(queryTokens, aliasTokens);
        }),
        // 4. one is contained in the other: "Alexis Mac Allister" vs "Mac Allister"
        (row) => row.aliases.some((alias) => {
          const aliasTokens = tokensOf(alias);
          if (!aliasTokens.length || !queryTokens.length) return false;
          return tokenSetCovers(queryTokens, aliasTokens)
            || tokenSetCovers(aliasTokens, queryTokens);
        }),
        // 5. surname only, as a last resort
        (row) => queryTokens.length === 1 && queryTokens[0].length >= 3
          && row.aliases.some((alias) => tokensOf(alias).slice(-1)[0] === queryTokens[0]),
      ];

    let matches = [];
    let tierUsed = 0;
    for (let tier = 0; tier < tiers.length; tier += 1) {
      const hits = rows.filter(tiers[tier]);
      if (hits.length) { matches = hits; tierUsed = tier + 1; break; }
    }

    const wantedTeam = normalisedTeam ? (canonicalTeamCode(reference.team) || null) : null;
    if (normalisedTeam) {
      const teamMatches = matches.filter((row) => row.teams.includes(normalisedTeam)
        || (wantedTeam && row.teams.includes(normalisePlayerReference(wantedTeam))));
      // Keep a single unambiguous name match even when the team qualifier is unrecognised.
      if (teamMatches.length > 0 || matches.length !== 1) matches = teamMatches;
    }

    if (matches.length === 0) {
      const suffix = reference.team ? ` for team ${reference.team}` : "";
      errors.push(`Unknown ${label} ${reference.name}${suffix}. `
        + `Pass the numeric FPL ID instead, or add a team qualifier like `
        + `"${reference.name} (CHE)". Do not retry with a different spelling.`);
      continue;
    }
    if (matches.length > 1) {
      const candidates = matches.map(({ player }) => {
        const canonical = canonicalPlayer(player);
        return `${canonical.web_name} (${canonical.team || "unknown team"}, ID ${canonical.fpl_id})`;
      }).join(", ");
      errors.push(`Ambiguous ${label} ${reference.name}: ${candidates}. `
        + `Re-send using the numeric FPL ID, or add a team like "${reference.name} (CHE)".`);
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
      match_tier: asId ? "fpl_id" : ["exact", "spacing", "initials", "partial", "surname"][tierUsed - 1] || "unknown",
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
