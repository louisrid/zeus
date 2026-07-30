import { buildBrief } from "../../../lib/server/fpl_brief_api.mjs";
import { buildSystemHealth } from "../../../lib/server/system_health.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const env = (...keys) => keys.map((key) => process.env[key]).find((value) => value && String(value).trim());
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*",
  },
});

function supabaseConfig() {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PROJECT_URL");
  const key = env(
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY",
    "SUPABASE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY",
  );
  if (!url || !key) throw new Error("Supabase URL/key are not available to the Zeus deployment");
  return { url: String(url).replace(/\/$/, ""), key: String(key) };
}

async function rows(table, query) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    cache: "no-store",
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} returned ${response.status}: ${text.slice(0, 500)}`);
  const value = text ? JSON.parse(text) : [];
  return Array.isArray(value) ? value : [];
}

export async function GET() {
  try {
    const unfinished = await rows("gameweeks", "select=gw&finished=is.false&order=gw.asc&limit=1");
    let gw = Number(unfinished[0]?.gw);
    if (!Number.isInteger(gw)) {
      const latest = await rows("projections", "select=gw,computed_at&order=computed_at.desc&limit=1");
      gw = Number(latest[0]?.gw);
    }
    if (!Number.isInteger(gw)) throw new Error("No projected gameweek exists");
    const [projectionRows, playerRows, teamRows] = await Promise.all([
      rows("projections", `select=*&gw=eq.${gw}&order=computed_at.desc&limit=5000`),
      rows("players", "select=*&archive=is.false&limit=2500"),
      rows("teams", "select=*&archive=is.false&limit=100"),
    ]);
    const brief = buildBrief({ projectionRows, playerRows, teamRows, gw });
    const health = buildSystemHealth({
      brief,
      deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      deploymentEnvironment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      openwebAuthRequired: Boolean(env(
        "ZEUS_API_KEY", "FPL_BRIEF_API_KEY", "FPLBOT_API_KEY", "FPL_API_KEY",
        "OPENWEBUI_API_KEY", "ZEUS_API_TOKEN", "FPL_API_SECRET",
      )),
    });
    return json(health, health.ok ? 200 : 503);
  } catch (error) {
    console.error("Zeus health check failed", error);
    return json({
      ok: false,
      status: "error",
      generated_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }, 503);
  }
}
