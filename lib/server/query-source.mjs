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
    /* Retried like the other reader, and for the same reason: a clock a second ahead of the one that
       signed the key rejects it with "JWT issued at future", and that passes on its own. Failing the
       whole page on it, and printing the database's own words, helps nobody. */
    let response = null;
    let raw = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(`${url}/rest/v1/${table}?${suffix}`, {
        cache: "no-store",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          accept: "application/json",
        },
      });
      // eslint-disable-next-line no-await-in-loop
      raw = await response.text();
      if (response.ok) break;
      if (!/JWT|502|503|504/i.test(raw)) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
    if (!response.ok) {
      throw new Error(/JWT/i.test(raw)
        ? `Could not read ${table} just now. This is usually momentary; reload in a few seconds.`
        : `${table} returned ${response.status}: ${raw.slice(0, 700)}`);
    }
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) throw new Error(`${table} returned a non-array response`);
    output.push(...rows);
    if (rows.length < pageSize) return output;
    if (output.length > 100_000) throw new Error(`${table} pagination exceeded the safety limit`);
  }
}
