const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function normaliseIds(value, field) {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${field} must be an array of positive integer player IDs.` };
  }
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, error: `${field} must contain only positive integer player IDs.` };
  }
  return { ok: true, value: [...new Set(ids)].sort((a, b) => a - b) };
}

export function parseExcludedPlayerIds(body = {}) {
  const input = body && typeof body === "object" ? body : {};
  const fields = ["excluded_player_ids", "exclude_player_ids", "ignores"]
    .filter((field) => own(input, field));

  if (!fields.length) return { ok: true, value: [], source: "none" };

  const parsed = [];
  for (const field of fields) {
    const result = normaliseIds(input[field], field);
    if (!result.ok) return result;
    parsed.push({ field, value: result.value });
  }

  const canonical = JSON.stringify(parsed[0].value);
  if (parsed.some((entry) => JSON.stringify(entry.value) !== canonical)) {
    return {
      ok: false,
      error: `Conflicting exclusion fields were supplied: ${fields.join(", ")}. Supply one matching exclusion list.`,
    };
  }

  return {
    ok: true,
    value: parsed[0].value,
    source: fields.includes("excluded_player_ids")
      ? "excluded_player_ids"
      : fields.includes("exclude_player_ids")
        ? "exclude_player_ids"
        : "ignores",
  };
}
