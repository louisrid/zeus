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

  if (mode === "benchboost" && !Object.values(chipSchedule).includes("benchboost")) {
    if (chipSchedule[gwFrom] && chipSchedule[gwFrom] !== "benchboost") {
      return { ok: false, status: 400, error: `More than one chip was assigned to GW${gwFrom}.` };
    }
    chipSchedule[gwFrom] = "benchboost";
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
  const excludedPlayerNames = namesFrom(
    "exclusions",
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
