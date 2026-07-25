/* Shared input validation for server routes. Kept in one place so the rules are testable
   without importing a route module. */

/* A missing id must never become 0: Number(null) is finite, which would address row zero. */
export function parseId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const POSITIONS = ["GKP", "DEF", "MID", "FWD"];

/* Only these fields reach the database, and only in these shapes. */
export function cleanSquad(squad, maxSize = 15) {
  if (!Array.isArray(squad) || squad.length === 0 || squad.length > maxSize) return null;
  const out = [];
  const seen = new Set();
  for (const p of squad) {
    const id = parseId(p?.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    if (!POSITIONS.includes(p.position)) return null;
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0 || price > 30) return null;
    out.push({
      id, position: p.position,
      web_name: String(p.web_name || "").slice(0, 60),
      team: String(p.team || "").slice(0, 6),
      team_id: parseId(p.team_id),
      price,
    });
  }
  return out;
}
