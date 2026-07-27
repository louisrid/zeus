/* PREDICTED LINE-UPS from Fantasy Football Pundit.
 *
 * Why a scrape rather than our own model: our minutes model answers "how likely is this player to start",
 * which is a forecast. "Who does this manager actually pick" is reporting, and a published source that
 * follows press conferences and leaks does it better than a model can. The two coexist: the minutes model
 * still drives xPTS, and this drives the Line-ups page.
 *
 * The page publishes, per club, a starting eleven with detailed positions (RB, DCM, ACM, LM, CF and so
 * on) and a list of potential starters. The formation is DERIVED from those positions rather than
 * assumed, which is what produces real shapes: 5-2-3 for Crystal Palace, 5-4-1 for Leeds, 4-5-1 for
 * Arsenal.
 */
import { createClient } from "@supabase/supabase-js";

const URL = "https://www.fantasyfootballpundit.com/fantasy-premier-league-team-news/";

/* The source's position codes, mapped to the three outfield lines. */
const LINE = {
  GK: "GK",
  RB: "DEF", LB: "DEF", CB: "DEF", RWB: "DEF", LWB: "DEF", WB: "DEF",
  DCM: "MID", ACM: "MID", CM: "MID", DM: "MID", AM: "MID", RM: "MID", LM: "MID", CAM: "MID",
  CF: "FWD", ST: "FWD", RF: "FWD", LF: "FWD", RW: "FWD", LW: "FWD",
};

const strip = (html) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

/* Every <table> is three columns: name, position, start percentage. */
function parseTable(html) {
  const rows = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]));
    if (cells.length < 2) continue;
    const [name, pos] = cells;
    if (!name || /^player$/i.test(name) || /^potential starters$/i.test(name)) continue;
    rows.push({ name, pos: (pos || "").toUpperCase() });
  }
  return rows;
}

function formationFrom(starters) {
  const count = { DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) {
    const line = LINE[p.pos];
    if (line && line !== "GK") count[line] += 1;
  }
  // A published eleven can carry an unrecognised code; fall back rather than invent a shape.
  if (count.DEF + count.MID + count.FWD !== 10) return null;
  return `${count.DEF}-${count.MID}-${count.FWD}`;
}

/* Name matching. The source writes full names ("Gabriel Magalhaes", "David Raya"); FPL uses short ones
   ("Gabriel", "Raya"). Surname first, then a containment check, then give up rather than guess. */
const norm = (s) => (s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function matchPlayer(name, clubPlayers) {
  const n = norm(name);
  if (!n) return null;
  const parts = n.split(" ");
  const surname = parts[parts.length - 1];

  const exact = clubPlayers.find((p) => norm(p.web_name) === n || norm(p.name) === n);
  if (exact) return exact;

  const bySurname = clubPlayers.filter((p) => norm(p.web_name) === surname
    || norm(p.name).split(" ").pop() === surname);
  if (bySurname.length === 1) return bySurname[0];

  // A full name that contains the FPL short name, or the reverse.
  const contained = clubPlayers.filter((p) => {
    const w = norm(p.web_name);
    return w.length > 2 && (n.includes(w) || norm(p.name).includes(n));
  });
  if (contained.length === 1) return contained[0];

  // Several candidates share the surname: prefer the one whose full name matches more words.
  if (bySurname.length > 1) {
    const scored = bySurname.map((p) => ({
      p, score: norm(p.name).split(" ").filter((w) => parts.includes(w)).length,
    })).sort((a, b) => b.score - a.score);
    if (scored[0].score > (scored[1] ? scored[1].score : 0)) return scored[0].p;
  }
  return null;
}

/* The source's club names against ours. Only the ones that genuinely differ are listed. */
const CLUB_ALIASES = {
  "man city": "man city", "man utd": "man utd", "nottingham forest": "nott'm forest",
  "nottm forest": "nott'm forest", "spurs": "tottenham", "wolves": "wolves",
};

function matchClub(clubName, teams) {
  const n = norm(clubName);
  const alias = CLUB_ALIASES[n] || n;
  const direct = teams.find((t) => norm(t.name) === alias || norm(t.short_name) === alias);
  if (direct) return direct;
  // A source name that starts the same way, e.g. "Nottingham Forest" against "Nott'm Forest".
  return teams.find((t) => norm(t.name).startsWith(alias.split(" ")[0])
    && alias.split(" ")[0].length >= 4) || null;
}

export async function run() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const res = await fetch(URL, { redirect: "follow", headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none",
  } });
  const html = await res.text();
  /* The site sits behind a bot challenge that answers a plain server request with a short body and no
     content. Saying so plainly beats writing an empty table and letting the page look broken. */
  if (!res.ok || !html.includes("Predicted Lineup")) {
    throw new Error(`Fantasy Football Pundit did not return the page (status ${res.status}, ${html.length} bytes). `
      + "It challenges automated requests, so this job may need to run from a different network. "
      + "Nothing was written, and the Line-ups page keeps using the minutes model until it succeeds.");
  }

  const [{ data: teams }, { data: players }] = await Promise.all([
    db.from("teams").select("id, fpl_id, name, short_name"),
    db.from("players").select("fpl_id, web_name, name, team_id, position").not("archive", "is", true),
  ]);
  if (!teams || !players) throw new Error("teams and players must be loaded first.");

  /* Each club is an <h2> containing "Predicted Lineup", followed by its two tables. */
  const sections = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const rows = [];
  for (let i = 0; i < sections.length; i++) {
    const heading = strip(sections[i][1]);
    const m = heading.match(/^(.*?)\s+Predicted Lineup/i);
    if (!m) continue;
    const club = m[1].trim();
    const from = sections[i].index;
    const to = i + 1 < sections.length ? sections[i + 1].index : html.length;
    const block = html.slice(from, to);

    const tables = [...block.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => parseTable(t[1]));
    if (!tables.length) continue;
    const starters = (tables[0] || []).slice(0, 11);
    const bench = (tables[1] || []);
    if (starters.length < 11) continue;

    const team = matchClub(club, teams);
    const clubPlayers = team ? players.filter((p) => p.team_id === team.id) : [];
    const resolve = (list) => list.map((r) => {
      const hit = clubPlayers.length ? matchPlayer(r.name, clubPlayers) : null;
      return { name: r.name, pos: r.pos, fpl_id: hit ? hit.fpl_id : null };
    });

    const fixtureMatch = block.match(/Fixture\s*[–-]\s*([^<\n]{2,40})/i);
    const updatedMatch = block.match(/Lineup Last Updated:\s*([^<\n]{4,30})/i);

    rows.push({
      club,
      fpl_team_id: team ? team.id : null,
      formation: formationFrom(starters),
      fixture: fixtureMatch ? strip(fixtureMatch[1]) : null,
      source_updated: updatedMatch ? strip(updatedMatch[1]) : null,
      starters: resolve(starters),
      bench: resolve(bench),
      fetched_at: new Date().toISOString(),
    });
  }

  if (!rows.length) throw new Error("No line-ups parsed. The source page layout has probably changed.");

  const { error } = await db.from("predicted_lineups").upsert(rows, { onConflict: "club" });
  if (error) throw new Error(error.message);

  const matched = rows.reduce((a, r) => a + r.starters.filter((s) => s.fpl_id).length, 0);
  const total = rows.reduce((a, r) => a + r.starters.length, 0);
  const shapes = [...new Set(rows.map((r) => r.formation).filter(Boolean))];
  return `${rows.length} clubs · ${matched} of ${total} starters matched · shapes ${shapes.join(", ")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((msg) => { console.log(msg); }).catch((e) => { console.error(e.message); process.exit(1); });
}
