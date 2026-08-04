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

  return {
    ok: true,
    mode,
    format,
    gwFrom,
    gwTo,
    budget,
    chipSchedule,
    transferHits,
    explicitRange: explicitFrom,
  };
}
