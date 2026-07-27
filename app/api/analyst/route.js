/* RETIRED. The in-app Analyst was built on 26 Jul 2026 and removed the same evening at Louis's
   instruction: he never asked for AI panels on pages. Copy payload is the accepted mechanism.
   This file cannot be deleted by a zip, so it is inert. It reaches no provider and holds no key. */
export async function POST() {
  return new Response(JSON.stringify({ ok: false, error: "The Analyst was removed. Use Copy payload." }),
    { status: 410, headers: { "Content-Type": "application/json" } });
}
