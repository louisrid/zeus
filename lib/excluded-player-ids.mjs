const NULLISH_TOKENS = new Set(["", "none", "null", "nil", "undefined", "nan", "n/a", "na", "-", "[]"]);

const isNullishToken = (value) =>
  value === null
  || value === undefined
  || NULLISH_TOKENS.has(String(value).trim().toLowerCase());

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function coerceList(value, field) {
  if (value === null || value === undefined) return { ok: true, list: [] };
  if (Array.isArray(value)) return { ok: true, list: value };
  if (typeof value === "number") return { ok: true, list: [value] };
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || NULLISH_TOKENS.has(text.toLowerCase())) return { ok: true, list: [] };
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return { ok: true, list: parsed };
      } catch {
        // fall through to delimiter splitting below
      }
      return { ok: true, list: text.slice(1, -1).split(/[,;|\s]+/) };
    }
    return { ok: true, list: text.split(/[,;|\s]+/) };
  }
  return { ok: false, error: `${field} must be an array of positive integer player IDs.` };
}

function normaliseIds(value, field) {
  const coerced = coerceList(value, field);
  if (!coerced.ok) return coerced;
  const cleaned = coerced.list.filter((entry) => !isNullishToken(entry));
  const ids = cleaned.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, error: `${field} must contain only positive integer player IDs.` };
  }
  return { ok: true, value: [...new Set(ids)].sort((a, b) => a - b) };
}

export function parseExcludedPlayerIds(body = {}) {
  const input = body && typeof body === "object" ? body : {};
  const fields = ["excluded_player_ids", "exclude_player_ids", "ignores"]
    .filter((field) => own(input, field) && input[field] !== null && input[field] !== undefined);
  if (!fields.length) return { ok: true, value: [], source: "none" };

  const parsed = [];
  for (const field of fields) {
    const result = normaliseIds(input[field], field);
    if (!result.ok) return result;
    if (result.value.length) parsed.push({ field, value: result.value });
  }
  if (!parsed.length) return { ok: true, value: [], source: "none" };

  const canonical = JSON.stringify(parsed[0].value);
  if (parsed.some((entry) => JSON.stringify(entry.value) !== canonical)) {
    return {
      ok: false,
      error: `Conflicting exclusion fields were supplied: ${parsed.map((entry) => entry.field).join(", ")}. Supply one matching exclusion list.`,
    };
  }

  const usedFields = parsed.map((entry) => entry.field);
  return {
    ok: true,
    value: parsed[0].value,
    source: usedFields.includes("excluded_player_ids")
      ? "excluded_player_ids"
      : usedFields.includes("exclude_player_ids")
        ? "exclude_player_ids"
        : "ignores",
  };
}
