import { timingSafeEqual } from "node:crypto";

const tokenValue = () => String(process.env.ZEUS_READ_ONLY_TOKEN || "").trim();

function secureEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authoriseReadOnlyRequest(request) {
  const expected = tokenValue();
  if (!expected) return { ok: false, status: 503, error: "ZEUS_READ_ONLY_TOKEN is not configured" };
  const header = String(request.headers.get("authorization") || "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!supplied || !secureEqual(supplied, expected)) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export function apiHeaders(extra = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    ...extra,
  };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: apiHeaders() });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: apiHeaders() });
}
