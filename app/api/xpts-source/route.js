import { XPTS_SOURCE_COOKIE, validXptsSource } from "../../../lib/xpts-source.mjs";

/* Sets the projections choice (lib/xpts-source.mjs) as a cookie for this browser. It is a display
   preference only: no account, no credentials. Set here rather than from page script so the browser never
   writes cookies itself. */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* empty body means the default */ }
  const source = validXptsSource(body?.source);
  return new Response(JSON.stringify({ ok: true, source }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${XPTS_SOURCE_COOKIE}=${source}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`,
    },
  });
}
