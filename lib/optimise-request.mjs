import { normaliseSquadChip } from "./squad-projection.mjs";

export const OPTIMISE_GW_MIN = 1;
export const OPTIMISE_GW_MAX = 8;
export const OPTIMISE_MODES = Object.freeze(["xi", "squad", "fifteen", "benchboost"]);

const integer = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function parseJsonObject(value, label) {
  if (!value) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, error: `${label} must be a JSON object.` };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` };
  }
}

export function parseOptimiseRequest(searchParams, { currentGw = 1 } = {}) {
  const mode = String(searchParams.get("mode") || "xi").toLowerCase();
  if (!OPTIMISE_MODES.includes(mode)) {
    return { ok: false, status: 400, error: `Unsupported mode: ${mode}.` };
  }

  const format = String(searchParams.get("format") || "text").toLowerCase() === "json" ? "json" : "text";
  const explicitFrom = searchParams.has("gw_from");
  const explicitTo = searchParams.has("gw_to");
  if (explicitFrom !== explicitTo) {
    return { ok: false, status: 400, error: "gw_from and gw_to must be supplied together." };
  }

  let gwFrom;
  let gwTo;
  if (explicitFrom) {
    gwFrom = integer(searchParams.get("gw_from"));
    gwTo = integer(searchParams.get("gw_to"));
  } else {
    const weeks = integer(searchParams.get("weeks")) ?? 1;
    gwFrom = integer(currentGw) ?? OPTIMISE_GW_MIN;
    gwTo = gwFrom + weeks - 1;
  }

  if (!Number.isInteger(gwFrom) || !Number.isInteger(gwTo)) {
    return { ok: false, status: 400, error: "Gameweek values must be integers." };
  }
  if (gwFrom < OPTIMISE_GW_MIN || gwTo > OPTIMISE_GW_MAX || gwTo < gwFrom) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported gameweek range GW${gwFrom}-GW${gwTo}. External xPTS supports GW${OPTIMISE_GW_MIN}-GW${OPTIMISE_GW_MAX}.`,
    };
  }

  const budgetValue = finite(searchParams.get("budget"));
  const budget = budgetValue === null ? 100 : budgetValue;
  if (budget < 50 || budget > 120) {
    return { ok: false, status: 400, error: "budget must be between 50 and 120." };
  }

  const chipJson = parseJsonObject(searchParams.get("chip_schedule"), "chip_schedule");
  if (!chipJson.ok) return { ok: false, status: 400, error: chipJson.error };
  const chipSchedule = {};
  for (const [rawGw, rawChip] of Object.entries(chipJson.value)) {
    const gameweek = integer(rawGw);
    const chip = normaliseSquadChip(rawChip);
    if (!Number.isInteger(gameweek) || gameweek < gwFrom || gameweek > gwTo || !chip) {
      return { ok: false, status: 400, error: `Invalid chip_schedule entry outside GW${gwFrom}-GW${gwTo}: ${rawGw}=${rawChip}.` };
    }
    chipSchedule[gameweek] = chip;
  }

  const legacyChip = normaliseSquadChip(searchParams.get("chip"));
  const legacyChipGw = integer(searchParams.get("chip_gw"));
  if (searchParams.has("chip") || searchParams.has("chip_gw")) {
    if (!legacyChip || !Number.isInteger(legacyChipGw)) {
      return { ok: false, status: 400, error: "chip and chip_gw must identify one supported chip and gameweek." };
    }
    if (legacyChipGw < gwFrom || legacyChipGw > gwTo) {
      return { ok: false, status: 400, error: `chip_gw must be inside the requested GW${gwFrom}-GW${gwTo} range.` };
    }
    if (chipSchedule[legacyChipGw] && chipSchedule[legacyChipGw] !== legacyChip) {
      return { ok: false, status: 400, error: `More than one chip was assigned to GW${legacyChipGw}.` };
    }
    chipSchedule[legacyChipGw] = legacyChip;
  }

  /* MODE benchboost WITHOUT A GAMEWEEK.
   *
   * This fallback exists for a request that says "bench boost" and never says when. It used to assume
   * the first week of the range, which is why a request for Bench Boost in GW2 came back with it played
   * in GW1: mode arrived as "benchboost", chip_gw was not read as an integer, and the fallback quietly
   * put the chip on gwFrom.
   *
   * A chip is worth several points in the right week and nothing in the wrong one, so guessing the week
   * is worse than refusing. If chip_gw was supplied it is honoured, and if nothing says which week, the
   * request is rejected with an instruction rather than silently answered for a different gameweek. */
  if (mode === "benchboost" && !Object.values(chipSchedule).includes("benchboost")) {
    if (Number.isInteger(legacyChipGw) && legacyChipGw >= gwFrom && legacyChipGw <= gwTo) {
      if (chipSchedule[legacyChipGw] && chipSchedule[legacyChipGw] !== "benchboost") {
        return { ok: false, status: 400, error: `More than one chip was assigned to GW${legacyChipGw}.` };
      }
      chipSchedule[legacyChipGw] = "benchboost";
    } else if (gwFrom === gwTo) {
      chipSchedule[gwFrom] = "benchboost";
    } else {
      return {
        ok: false,
        status: 400,
        error: `Bench Boost needs the gameweek it is played in. Send chip_gw, or chip_schedule such as {"${gwFrom + 1}":"benchboost"}. It was not assumed to be GW${gwFrom}.`,
      };
    }
  }

  const hitJson = parseJsonObject(searchParams.get("transfer_hits"), "transfer_hits");
  if (!hitJson.ok) return { ok: false, status: 400, error: hitJson.error };
  const transferHits = {};
  for (const [rawGw, rawHit] of Object.entries(hitJson.value)) {
    const gameweek = integer(rawGw);
    const hit = finite(rawHit);
    if (!Number.isInteger(gameweek) || gameweek < gwFrom || gameweek > gwTo || hit === null || hit < 0) {
      return { ok: false, status: 400, error: `Invalid transfer_hits entry outside GW${gwFrom}-GW${gwTo}: ${rawGw}=${rawHit}.` };
    }
    transferHits[gameweek] = hit;
  }

  const NULLISH = new Set(["none","null","nil","undefined","nan","n/a","na","-","[]"]);
  const namesFrom = (...keys) => {
    const out = [];
    for (const key of keys) {
      const raw = searchParams.get(key);
      if (!raw) continue;
      for (const part of String(raw).split(/[,;|]+/)) {
        const clean = part.trim();
        if (!clean || NULLISH.has(clean.toLowerCase()) || out.includes(clean)) continue;
        out.push(clean);
      }
    }
    return out;
  };
  const keepPlayerNames = namesFrom("keep_player_names", "include_player_names");
  const lockedPlayerNames = namesFrom("locked_player_names");
  /* Allow-list. When supplied, the candidate pool is cut to just these players
     before the solver runs, so a shortlist can be handed in directly instead of
     excluding the several hundred players you do not want. */
  const onlyPlayerNames = namesFrom("only_player_names", "only_players", "pool_player_names");
  /* Transfer limit against a squad you already own. */
  /* Squad rules. Semicolon separated, each one a count limit over any combination
     of club, position and price. Examples:
       max 0 club=MCI pos=DEF      no City defenders
       min 2 club=ARS              at least two Arsenal players
       min 1 club=ARS pos=FWD      at least one Arsenal forward
       max 1 pos=DEF price=4.0     at most one 4.0 defender
       max 2 pos=MID price<=5.0    at most two midfielders at 5.0 or under */
  const POSITION_CODES_RULE = ["GKP", "DEF", "MID", "FWD"];
  const squadRules = [];
  {
    const raw = searchParams.get("squad_rules") ?? searchParams.get("rules");
    if (raw && String(raw).trim() !== "") {
      for (const chunk of String(raw).split(";")) {
        const text = chunk.trim();
        if (!text) continue;
        const parts = text.split(/\s+/);
        const op = String(parts[0] || "").toLowerCase();
        if (op !== "min" && op !== "max") {
          return { ok: false, status: 400,
            error: `squad_rules: each rule must start with min or max, got "${text}".` };
        }
        const count = Number(parts[1]);
        if (!Number.isInteger(count) || count < 0 || count > 15) {
          return { ok: false, status: 400,
            error: `squad_rules: "${text}" needs a whole number from 0 to 15 after ${op}.` };
        }
        const rule = { op, count, club: null, position: null, price: null, priceOp: null };
        for (const token of parts.slice(2)) {
          const m = token.match(/^(club|team|pos|position|price)(<=|>=|=)(.+)$/i);
          if (!m) {
            return { ok: false, status: 400,
              error: `squad_rules: could not read "${token}" in "${text}". Use club=, pos= or price=.` };
          }
          const key = m[1].toLowerCase(); const cmp = m[2]; const value = m[3].trim();
          if (key === "club" || key === "team") rule.club = value.toUpperCase();
          else if (key === "pos" || key === "position") {
            const pos = value.toUpperCase();
            if (!POSITION_CODES_RULE.includes(pos)) {
              return { ok: false, status: 400,
                error: `squad_rules: unknown position "${value}". Use GKP, DEF, MID or FWD.` };
            }
            rule.position = pos;
          } else {
            const price = Number(value);
            if (!Number.isFinite(price) || price <= 0) {
              return { ok: false, status: 400,
                error: `squad_rules: price in "${text}" must be a positive number.` };
            }
            rule.price = price;
            rule.priceOp = cmp === "<=" ? "lte" : cmp === ">=" ? "gte" : "eq";
          }
        }
        squadRules.push(rule);
      }
    }
  }
  const currentSquadNames = namesFrom("current_squad_names", "current_squad", "my_squad_names");
  let maximumChanges = null;
  {
    const raw = searchParams.get("maximum_changes") ?? searchParams.get("max_changes");
    if (raw !== null && String(raw).trim() !== "") {
      const n = Number(String(raw).trim());
      if (!Number.isInteger(n) || n < 0 || n > 15) {
        return { ok: false, status: 400, error: "maximum_changes must be a whole number from 0 to 15." };
      }
      if (!currentSquadNames.length) {
        return { ok: false, status: 400,
          error: "maximum_changes needs current_squad_names so it knows which squad to compare against." };
      }
      maximumChanges = n;
    }
  }
  const excludedPlayerNames = namesFrom(    "exclusions",
    "excluded_player_names",
    "exclude_player_names",
    "excluded_player_names_text",
  );
  const excludedPlayerIds = [];  for (const key of ["excluded_player_ids", "exclude_player_ids", "ignores"]) {
    const raw = searchParams.get(key);
    if (!raw) continue;
    for (const part of String(raw).replace(/^\[|\]$/g, "").split(/[,;|\s]+/)) {
      const clean = part.trim();
      if (!clean || NULLISH.has(clean.toLowerCase())) continue;
      const id = Number(clean);
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, status: 400, error: `${key} must contain only positive integer player IDs.` };
      }
      if (!excludedPlayerIds.includes(id)) excludedPlayerIds.push(id);
    }
  }
  /* Three separate goalkeeper controls. maximum_goalkeeper_spend caps what the pair costs together,
     which the other two could not express: goalkeeper_max_price caps one keeper and
     minimum_goalkeepers_at_or_below_price counts how many sit under that price. */
  const positiveOrNull = (key, label) => {
    const raw = searchParams.get(key);
    if (raw === null || String(raw).trim() === "" || NULLISH.has(String(raw).trim().toLowerCase())) {
      return { ok: true, value: null };
    }
    const value = Number(String(raw).trim());
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: `${label} must be a positive number when supplied.` };
    }
    return { ok: true, value };
  };

  const gkSpend = positiveOrNull("maximum_goalkeeper_spend", "maximum_goalkeeper_spend");
  if (!gkSpend.ok) return { ok: false, status: 400, error: gkSpend.error };
  const maximumGoalkeeperSpend = gkSpend.value;

  const gkMax = positiveOrNull("goalkeeper_max_price", "goalkeeper_max_price");
  if (!gkMax.ok) return { ok: false, status: 400, error: gkMax.error };
  const goalkeeperMaxPrice = gkMax.value;

  let minimumGoalkeepersAtOrBelowPrice = 1;
  const cheapRaw = searchParams.get("minimum_goalkeepers_at_or_below_price");
  if (cheapRaw !== null && String(cheapRaw).trim() !== "") {
    const count = Number(String(cheapRaw).trim());
    if (!Number.isInteger(count) || count < 1 || count > 2) {
      return { ok: false, status: 400, error: "minimum_goalkeepers_at_or_below_price must be 1 or 2." };
    }
    minimumGoalkeepersAtOrBelowPrice = count;
  }

  /* Per-position price rules, given as "MID:5.5, DEF:6". A minimum price is how Louis says
     "no midfielders at £5m or less": set the floor just above the price he wants excluded. */
  const POSITION_CODES = ["GKP", "DEF", "MID", "FWD"];
  const parsePositionMap = (key) => {
    const raw = searchParams.get(key);
    if (raw === null || String(raw).trim() === "") return { ok: true, value: null };
    const out = {};
    for (const part of String(raw).split(/[,;]+/)) {
      const piece = part.trim();
      if (!piece) continue;
      const [rawPosition, rawValue] = piece.split(":").map((s) => (s ?? "").trim());
      const position = String(rawPosition || "").toUpperCase();
      if (!POSITION_CODES.includes(position)) {
        return { ok: false, error: `${key} uses unknown position "${rawPosition}". Use GKP, DEF, MID or FWD, e.g. "MID:5.5".` };
      }
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, error: `${key} needs a positive figure for ${position}, e.g. "${position}:5.5".` };
      }
      out[position] = value;
    }
    return { ok: true, value: Object.keys(out).length ? out : null };
  };

  const minPrice = parsePositionMap("minimum_price_by_position");
  if (!minPrice.ok) return { ok: false, status: 400, error: minPrice.error };
  const maxPrice = parsePositionMap("maximum_price_by_position");
  if (!maxPrice.ok) return { ok: false, status: 400, error: maxPrice.error };
  const maxSpend = parsePositionMap("maximum_spend_by_position");
  if (!maxSpend.ok) return { ok: false, status: 400, error: maxSpend.error };
  const minimumPriceByPosition = minPrice.value;
  const maximumPriceByPosition = maxPrice.value;
  const maximumSpendByPosition = maxSpend.value;

  const lockGameweeks = [];
  for (const part of String(searchParams.get("locked_player_gameweeks") ?? "")
    .split(/[,;|\s]+/)) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !lockGameweeks.includes(n)) lockGameweeks.push(n);
  }
  if (keepPlayerNames.length + lockedPlayerNames.length > 15) {
    return { ok: false, status: 400, error: "Required players cannot exceed the 15-player squad." };
  }
  if (lockedPlayerNames.length > 11) {
    return { ok: false, status: 400, error: "Cannot lock more than 11 players into the starting XI." };
  }

  return {
    ok: true,
    mode,
    format,
    gwFrom,
    gwTo,
    budget,
    chipSchedule,
    transferHits,
    keepPlayerNames,
    lockedPlayerNames,
    lockGameweeks,
    excludedPlayerNames,
    onlyPlayerNames,
    currentSquadNames,
    squadRules,
    maximumChanges,
    excludedPlayerIds,
    maximumGoalkeeperSpend,
    goalkeeperMaxPrice,
    minimumGoalkeepersAtOrBelowPrice,
    minimumPriceByPosition,
    maximumPriceByPosition,
    maximumSpendByPosition,
    explicitRange: explicitFrom,
  };
}
