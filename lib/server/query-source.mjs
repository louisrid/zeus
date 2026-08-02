const DEFAULT_PAGE_SIZE = 1000;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server URL/service key are not configured");
  return { url: String(url).replace(/\/$/, ""), key: String(key) };
}

export async function readAllSupabaseRows(table, query = "", pageSize = DEFAULT_PAGE_SIZE) {
  const { url, key } = supabaseConfig();
  const output = [];
  for (let offset = 0; ; offset += pageSize) {
    const suffix = `${query ? `${query}&` : ""}limit=${pageSize}&offset=${offset}`;
    const response = await fetch(`${url}/rest/v1/${table}?${suffix}`, {
      cache: "no-store",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`${table} returned ${response.status}: ${raw.slice(0, 700)}`);
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) throw new Error(`${table} returned a non-array response`);
    output.push(...rows);
    if (rows.length < pageSize) return output;
    if (output.length > 100_000) throw new Error(`${table} pagination exceeded the safety limit`);
  }
}
