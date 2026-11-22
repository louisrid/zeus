/* MEAN OF THREE: Sideline Quant, FPL GO and FPL Copilot.
 *
 * Writes config/blend-xpts-2026-27.mjs in exactly the shape of config/external-xpts-2026-27.mjs, so the
 * scorer can serve either file unchanged. Run after jobs/external_xpts_pull.mjs, whose Copilot file it
 * reads instead of fetching Copilot again.
 *
 * Coverage differs by source, and a missing figure is never treated as zero:
 *   Sideline Quant  next gameweek only   https://sidelinequant.com/data/latest.json (CC BY 4.0)
 *   FPL GO          next five gameweeks  https://www.fpl-go.com/forecasts, 27 pages of HTML
 *   FPL Copilot     every gameweek       the existing import
 * Each gameweek's figure is the mean of the sources that cover it: three for the next week, two for the
 * four after, Copilot alone beyond that. Minutes are the mean of Sideline's e_mins (next week) and
 * Copilot's minutes. If Sideline or FPL GO cannot be read, the file is still written from what was read
 * and says which sources were used; the update never stops on it.
 *
 * Rows are keyed by FPL element id: Sideline's player_id and FPL GO's compare-checkbox value are both the
 * official id. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT_PATH = path.join(process.cwd(), "config", "blend-xpts-2026-27.mjs");
const COPILOT_URL = pathToFileURL(path.join(process.cwd(), "config", "external-xpts-2026-27.mjs")).href;
const SIDELINE_URL = "https://sidelinequant.com/data/latest.json";
const FPLGO_URL = (page) => `https://www.fpl-go.com/forecasts?horizon=5&sort=points&page=${page}`;
const HEADERS = { "User-Agent": "Mozilla/5.0 (FPLBot projections reader)", Accept: "*/*" };

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/* latest.json is a redirect that can lag a round behind (on 2 Nov it still pointed at GW9, which then
   answered 404 "only gameweek 10 is currently published"). When it fails, the error names the published
   round, and that round's own file is read instead. */
async function fetchSidelineJson(url) {
  const res = await fetch(url, { headers: { ...HEADERS, Accept: "application/json" } });
  let body = null; try { body = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, body };
}
async function readSideline() {
  let { ok, status, body } = await fetchSidelineJson(SIDELINE_URL);
  if ((!ok || !Array.isArray(body?.rows) || !body.rows.length) && Number.isInteger(Number(body?.available))) {
    ({ ok, status, body } = await fetchSidelineJson(`https://sidelinequant.com/data/gw/${Number(body.available)}/projections.json`));
  }
  if (!ok || !Array.isArray(body?.rows) || !body.rows.length) throw new Error(`HTTP ${status}${body?.detail ? `: ${body.detail}` : ""}`);
  const data = body;
  const gw = Number(data.gameweek);
  const byId = new Map();
  /* Rows are per fixture: a double gameweek has two rows, summed into the gameweek total. */
  for (const row of data.rows || []) {
    const id = Number(row.player_id);
    const xp = num(row.xP), mins = num(row.e_mins);
    if (!Number.isFinite(id) || xp === null) continue;
    const cur = byId.get(id) || { xp: 0, mins: 0 };
    cur.xp += xp; cur.mins += mins ?? 0;
    byId.set(id, cur);
  }
  return { gw, byId, generated_at: data.generated_at || null };
}

async function readFplGo() {
  const byId = new Map();
  let gws = null;
  let pages = 1;
  for (let page = 1; page <= pages; page += 1) {
    const res = await fetch(FPLGO_URL(page), { headers: HEADERS });
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
    const html = await res.text();
    if (page === 1) {
      const m = html.match(/(\d+) of (\d+)/);
      pages = m ? Math.min(60, Number(m[2])) : 1;
    }
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    if (!gws) {
      gws = [...table.matchAll(/<th[^>]*>\s*GW(\d+)\s*<\/th>/g)].map((m) => Number(m[1]));
      if (!gws.length) throw new Error("no gameweek columns found");
    }
    for (const tr of table.split("<tr").slice(1)) {
      const idMatch = tr.match(/name="compare" value="(\d+)"/);
      if (!idMatch) continue;
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      /* cells[0] is the compare box; the next gws.length cells are the gameweek figures. */
      const values = cells.slice(1, 1 + gws.length).map(num);
      byId.set(Number(idMatch[1]), values);
    }
  }
  return { gws, byId, pages };
}

export async function main() {
  const copilot = (await import(`${COPILOT_URL}?t=${Date.now()}`)).default;
  const length = copilot.rows[0]?.xpts?.length || 38;

  const used = ["FPL Copilot"];
  let sideline = null, fplgo = null;
  try { sideline = await readSideline(); used.push("Sideline Quant"); console.log(`Sideline Quant: GW${sideline.gw}, ${sideline.byId.size} players`); }
  catch (error) { console.log(`Sideline Quant could not be read (${error.message}); the mean is taken without it.`); }
  try { fplgo = await readFplGo(); used.push("FPL GO"); console.log(`FPL GO: GW${fplgo.gws[0]}-GW${fplgo.gws.at(-1)}, ${fplgo.byId.size} players over ${fplgo.pages} pages`); }
  catch (error) { console.log(`FPL GO could not be read (${error.message}); the mean is taken without it.`); }

  const rows = copilot.rows.map((row) => {
    const id = Number(row.fpl_id);
    const xpts = [], minutes = [], parts = {};
    for (let i = 0; i < length; i += 1) {
      const gw = (Number(copilot.gw_from) || 1) + i;
      const cp = num(row.xpts?.[i]);
      const sq = sideline && sideline.gw === gw && sideline.byId.has(id) ? sideline.byId.get(id).xp : null;
      const goIdx = fplgo ? fplgo.gws.indexOf(gw) : -1;
      const go = goIdx >= 0 && fplgo.byId.has(id) ? fplgo.byId.get(id)[goIdx] : null;
      const present = [sq, go, cp].filter((v) => v !== null);
      xpts.push(present.length ? round2(present.reduce((a, b) => a + b, 0) / present.length) : 0);
      if (present.length > 1) parts[gw] = [sq === null ? null : round2(sq), go, cp];
      const cpMin = num(row.minutes?.[i]);
      const sqMin = sideline && sideline.gw === gw && sideline.byId.has(id) ? sideline.byId.get(id).mins : null;
      const mins = [sqMin, cpMin].filter((v) => v !== null);
      minutes.push(mins.length ? round2(mins.reduce((a, b) => a + b, 0) / mins.length) : 0);
    }
    return {
      ...row,
      xpts, minutes, parts,
      total: Math.round(xpts.reduce((a, b) => a + b, 0) * 10) / 10,
      display_minutes: minutes[0],
    };
  });

  const payload = {
    ...Object.fromEntries(Object.entries(copilot).filter(([key]) => key !== "rows")),
    source: `Mean of ${used.join(", ")}`,
    source_url: "https://sidelinequant.com/data, https://www.fpl-go.com/forecasts, https://api.fplcopilot.com/api/expected-points",
    imported_at: new Date().toISOString(),
    sources_used: used,
    coverage: {
      sideline: sideline ? { gameweek: sideline.gw, players: sideline.byId.size, generated_at: sideline.generated_at } : null,
      fplgo: fplgo ? { gameweeks: fplgo.gws, players: fplgo.byId.size } : null,
      copilot: { imported_at: copilot.imported_at },
    },
    attribution: "Sideline Quant data used under CC BY 4.0, https://sidelinequant.com",
    blend_policy: "Each gameweek is the mean of the sources that cover it; a source that does not cover a week is left out, never counted as zero. parts holds [Sideline, FPL GO, Copilot] wherever more than one source covers the week.",
    rows,
  };
  const header = `/* MEAN-OF-THREE EXPECTED POINTS, 2026/27.\n *\n * GENERATED FILE. Do not edit by hand: run \`node jobs/blend_xpts_pull.mjs\` after jobs/external_xpts_pull.mjs.\n * Written ${payload.imported_at} from ${used.join(", ")}.\n */\nconst DATA = `;
  await writeFile(OUT_PATH, `${header}${JSON.stringify(payload)};\nexport default DATA;\n`, "utf8");
  console.log(`Mean projections written for ${rows.length} players from ${used.join(", ")}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
