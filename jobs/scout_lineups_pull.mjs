/* PREDICTED LINE-UPS, PULLED FROM FANTASY FOOTBALL SCOUT.
 *
 * Replaces a manual transcription of config/lineups.json with a scrape that runs
 * every 24 hours. The engine already knows how to consume that file, so nothing
 * downstream changes: this only keeps it current.
 *
 * WHY THE PHOTO ID MATTERS. Every player on the Scout page carries a Premier
 * League photo URL, and that number is the same value FPL exposes as `code`.
 * Measured on the live page: 219 of 220 players resolve by code alone. Name
 * matching is kept only as a fallback for the remainder, because a wrong player
 * silently poisons the minutes model and is far worse than an unmatched one.
 *
 * WHY ROWS ARE REBUILT RATHER THAN TRUSTED. Scout publishes its own row layout,
 * but the engine's pitch renderer expects rows grouped strictly by position:
 * goalkeeper, then defenders, then midfielders, then forwards, using OUR position
 * for each player. A winger Scout draws in midfield may be a forward in FPL, so
 * taking their rows verbatim produces a squad the renderer cannot lay out. The
 * formation string is derived from the rebuilt rows for the same reason.
 *
 * FAIL CLOSED. If fewer than 20 clubs parse, or a club does not yield 11 players,
 * or the page shape changes, the job exits non-zero and leaves the existing file
 * untouched. A stale lineup file is recoverable. A half-written one is not.
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_KEY are optional. With them, positions
 * come from the stored player table; without them the job falls back to the public
 * FPL bootstrap, so it still works in a bare environment.
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { norm, resolveName, clubOfRow } from "../lib/lineups.mjs";

const SOURCE_URL = "https://www.fantasyfootballscout.co.uk/team-news";
const OUT_PATH = new URL("../config/lineups.json", import.meta.url);

const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/120 Safari/537.36";
const EXPECTED_CLUBS = 20;
const XI_SIZE = 11;
/* The file must always describe all twenty clubs. Writing nineteen is not a smaller
   version of the same thing: the engine gates minutes on the published elevens, so a
   missing club silently changes every projection, and the repository's own tests
   assert twenty. When a club cannot be resolved, usually because a fresh signing is
   not in FPL's player list yet, its previous entry is carried forward unchanged and
   flagged as stale rather than dropped. */
const MIN_FRESH_CLUBS = 17;

const JOB = "scout_lineups_pull";

/* The status page reads pipeline_heartbeats to say whether each job is current.
   Without a beat this job would sit there permanently unknown. Writing it is
   best-effort: failing to record a heartbeat must never fail a good pull. */
async function beat(status, message) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;
  try {
    const now = new Date().toISOString();
    await createClient(url, key).from("pipeline_heartbeats").upsert({
      job_name: JOB,
      last_run_at: now,
      ...(status === "ok" ? { last_success_at: now } : {}),
      status,
      message: String(message || "").slice(0, 500),
    });
  } catch (error) {
    console.error(`heartbeat not recorded: ${error.message}`);
  }
}

const POSITION_ORDER = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
const ELEMENT_TYPE = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ");
const decode = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, " ").trim();

/* ---------------------------------------------------------------- fetching */

async function fetchPage() {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`team-news page returned ${res.status}`);
  const html = await res.text();
  if (html.length < 50_000) throw new Error(`team-news page was only ${html.length} bytes, expected far more`);
  return html;
}

/* Positions and names for resolution. The stored player table is preferred because
   it is what the engine itself uses; the public bootstrap is a fallback so this job
   is runnable without secrets. */
async function loadPlayers() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    const db = createClient(url, key);
    /* Archive rows belong to relegated clubs and cannot feature this season. Left in,
       they let a shared surname resolve to a player who is not in the league. */
    const { data, error } = await db.from("players")
      .select("id, code, web_name, first_name, second_name, position, team_id")
      .not("archive", "is", true);
    if (error) throw new Error(`players: ${error.message}`);
    if (data?.length) {
      return { players: data, origin: "supabase" };
    }
  }
  const res = await fetch(FPL_BOOTSTRAP, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`FPL bootstrap returned ${res.status}`);
  const boot = await res.json();
  const players = boot.elements.map((e) => ({
    id: e.id,
    code: e.code,
    web_name: e.web_name,
    first_name: e.first_name,
    second_name: e.second_name,
    position: ELEMENT_TYPE[e.element_type] || null,
    team_id: e.team,
  }));
  return { players, origin: "fpl-bootstrap", teams: boot.teams };
}

async function loadTeams(fallbackTeams) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    const db = createClient(url, key);
    const { data, error } = await db.from("teams").select("id, name, short_name");
    if (!error && data?.length) return data;
  }
  if (fallbackTeams?.length) {
    return fallbackTeams.map((t) => ({ id: t.id, name: t.name, short_name: t.short_name }));
  }
  throw new Error("could not load the teams table from Supabase or the FPL bootstrap");
}

/* ---------------------------------------------------------------- parsing */

function parseClubBlocks(html) {
  const blocks = [...html.matchAll(
    /<li class="team-news-item" data-team-code="([a-z]+)"([\s\S]*?)(?=<li class="team-news-item"|<\/ol>)/g,
  )];
  return blocks.map(([, code, body]) => ({ code: code.toUpperCase(), body }));
}

function namedList(body, label) {
  /* Each list sits as <strong>Label:</strong><ul class="players"><li>Name</li>...
     An empty label is normal and common. The search is bounded at the next <strong>
     so an empty Out does not reach forward and return the Doubts list instead, which
     is exactly what happened before this bound existed. */
  const at = body.indexOf(`<strong>${label}:</strong>`);
  if (at === -1) return [];
  const from = at + `<strong>${label}:</strong>`.length;
  const nextLabel = body.indexOf("<strong>", from);
  const region = body.slice(from, nextLabel === -1 ? body.length : nextLabel);
  const list = region.match(/<ul class="players">([\s\S]*?)<\/u[lL]>/);
  if (!list) return [];
  return [...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((m) => clean(m[1]))
    .filter(Boolean);
}

function parseClub({ code, body }) {
  const club = clean((body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
  const fixture = clean((body.match(/<strong>Next Match:<\/strong>([\s\S]*?)<\/div>/) || [])[1]);
  const updated = clean((body.match(/Last Updated\s*([^<]+)/) || [])[1]);
  const sourceFormation = (body.match(/formation-([\d-]+)/) || [])[1] || null;

  /* Rows are read in order so a player's on-pitch grouping is known, but only the
     names and photo ids are taken forward. Position grouping is rebuilt later. */
  const entries = [];
  for (const [, rowNo, rowBody] of body.matchAll(/<ul class="row-(\d+)">([\s\S]*?)<\/ul>/g)) {
    for (const [, item] of rowBody.matchAll(/<li\b([\s\S]*?)<\/li>/g)) {
      const name = clean((item.match(/<span class="player-name[^"]*">([\s\S]*?)<\/span>/) || [])[1]);
      const photo = (item.match(/\/players\/\d+x\d+\/(\d+)\.png/) || [])[1];
      const title = clean((item.match(/^\s*title="([^"]*)"/) || [])[1]);
      if (!name && !photo) continue;
      entries.push({ name, title, code: photo ? Number(photo) : null, sourceRow: Number(rowNo) });
    }
  }

  return {
    code,
    club,
    fixture,
    updated,
    sourceFormation,
    entries,
    out: namedList(body, "Out"),
    doubts: namedList(body, "Doubts"),
    banned: namedList(body, "Banned"),
  };
}

/* ---------------------------------------------------------------- resolving */

function buildResolvers(players) {
  const byCode = new Map();
  for (const p of players) {
    if (p.code != null) byCode.set(Number(p.code), p);
  }
  return { byCode };
}

/* Photo id first, because it names exactly one FPL element and cannot be confused
   by two players sharing a surname. Name resolution is the fallback only. */
function resolvePlayer(entry, { byCode }, players, teamId) {
  if (entry.code != null && byCode.has(entry.code)) {
    return { player: byCode.get(entry.code), via: "code" };
  }
  for (const candidate of [entry.name, entry.title.replace(/\s*\([^)]*\)\s*$/, "")]) {
    if (!candidate) continue;
    const hit = resolveName(candidate, players, teamId);
    if (hit) return { player: hit, via: "name" };
  }
  return { player: null, via: null };
}

/* Rows are kept exactly as the source draws them, because the row index is not
   cosmetic: lineupFootballRolesOf reads it to tell a holding midfielder from an
   attacking one, and a full back from a wing back. Regrouping by FPL position
   throws that away and mislabels every wide player. The formation string the
   source publishes describes the same drawing, so it is kept alongside. */
function layoutFromSource(resolved, sourceFormation) {
  const byRow = new Map();
  for (const r of resolved) {
    if (!byRow.has(r.sourceRow)) byRow.set(r.sourceRow, []);
    byRow.get(r.sourceRow).push(r);
  }
  const rowNumbers = [...byRow.keys()].sort((a, b) => a - b);
  /* The source draws the goalkeeper at the top of the frame, which puts the team's
     own right on the viewer's left. Taking the DOM order literally mirrors every
     line, and a mirrored back four is still four defenders, so no positional check
     catches it. Reversing each row restores team-left-to-right, which is the
     orientation the file declares and the pitch component renders against.
     Verified against the hand-transcribed file: reversing reproduced Liverpool,
     Aston Villa and Arsenal's back lines exactly. */
  const rows = rowNumbers.map((n) => byRow.get(n).map((r) => r.displayName).reverse());
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const r of resolved) {
    const pos = r.player.position;
    if (counts[pos] === undefined) return null;
    counts[pos] += 1;
  }
  const derived = rows.slice(1).map((row) => row.length).join("-");
  return { rows, formation: sourceFormation || derived, derivedFormation: derived, counts };
}

/* ---------------------------------------------------------------- main */

async function main() {
  const html = await fetchPage();
  const rawBlocks = parseClubBlocks(html);
  if (rawBlocks.length !== EXPECTED_CLUBS) {
    throw new Error(`parsed ${rawBlocks.length} club blocks, expected ${EXPECTED_CLUBS}. `
      + "The page structure has probably changed; the existing lineups file has been left alone.");
  }

  const { players, origin, teams: bootTeams } = await loadPlayers();
  const teams = await loadTeams(bootTeams);
  const resolvers = buildResolvers(players);

  /* Loaded before parsing so a club that fails to resolve can fall back to it. */
  let previous = null;
  if (existsSync(OUT_PATH)) {
    try { previous = JSON.parse(readFileSync(OUT_PATH, "utf8")); } catch { previous = null; }
  }
  const previousByShort = new Map((previous?.clubs || []).map((c) => [c.short, c]));

  const clubs = [];
  const carriedForward = [];
  const failures = [];
  const unmatched = [];
  let viaCode = 0;
  let viaName = 0;

  for (const raw of rawBlocks) {
    const parsed = parseClub(raw);
    const carryForward = (reason) => {
      const prev = previousByShort.get(parsed.code);
      failures.push(`${parsed.code}: ${reason}`);
      if (prev) {
        clubs.push({ ...prev, stale: true, stale_reason: reason });
        carriedForward.push(parsed.code);
        return true;
      }
      return false;
    };

    if (parsed.entries.length !== XI_SIZE) {
      carryForward(`page listed ${parsed.entries.length} players, expected ${XI_SIZE}`);
      continue;
    }

    const team = clubOfRow({ club: parsed.club, short: parsed.code }, teams);
    const resolved = [];
    for (const entry of parsed.entries) {
      const { player, via } = resolvePlayer(entry, resolvers, players, team?.id);
      if (!player) {
        unmatched.push({ club: parsed.code, name: entry.name || entry.title, code: entry.code });
        continue;
      }
      if (via === "code") viaCode += 1; else viaName += 1;
      resolved.push({ ...entry, player, displayName: player.web_name });
    }

    if (resolved.length !== XI_SIZE) {
      const names = unmatched.filter((u) => u.club === parsed.code).map((u) => u.name).join(", ");
      carryForward(`resolved ${resolved.length} of ${XI_SIZE}, not in the FPL player list: ${names}`);
      continue;
    }

    const seen = new Set(resolved.map((r) => r.player.id));
    if (seen.size !== XI_SIZE) {
      carryForward("the same player was named twice");
      continue;
    }

    const layout = layoutFromSource(resolved, parsed.sourceFormation);
    if (!layout) { carryForward("a player has no position in our data"); continue; }
    if (layout.counts.GKP !== 1) {
      carryForward(`${layout.counts.GKP} goalkeepers named, expected exactly 1`);
      continue;
    }
    if (layout.rows[0].length !== 1) {
      carryForward(`back row had ${layout.rows[0].length} players, expected the goalkeeper alone`);
      continue;
    }

    const ids = {};
    for (const r of resolved) ids[r.displayName] = r.player.id;

    clubs.push({
      club: parsed.club,
      short: parsed.code,
      fixture: parsed.fixture,
      updated: parsed.updated,
      formation: layout.formation,
      rows: layout.rows,
      ids,
      out: parsed.out,
      doubts: parsed.doubts,
      banned: parsed.banned,
      source_formation: parsed.sourceFormation,
      derived_formation: layout.derivedFormation,
    });
  }

  const fresh = clubs.length - carriedForward.length;
  if (fresh < MIN_FRESH_CLUBS) {
    throw new Error(`Only ${fresh} of ${EXPECTED_CLUBS} clubs parsed cleanly, below the floor of `
      + `${MIN_FRESH_CLUBS}. The page has probably changed. Nothing was written and the existing `
      + `file stands.\n  ` + failures.join("\n  "));
  }
  if (clubs.length !== EXPECTED_CLUBS) {
    throw new Error(`Would have written ${clubs.length} clubs, not ${EXPECTED_CLUBS}. The engine gates `
      + `minutes on the published elevens and a missing club changes every projection, so nothing was `
      + `written.\n  ` + failures.join("\n  "));
  }

  clubs.sort((a, b) => a.club.localeCompare(b.club));

  /* The gameweek is carried forward from the file being replaced. Scout does not
     state it, and guessing it wrong would gate the whole projection run against
     the wrong week. */
  const gameweek = Number.isFinite(Number(previous?.gameweek)) ? Number(previous.gameweek) : 1;
  const previousNote = previous?.confidence_note || null;

  const payload = {
    note: "Predicted line-ups scraped from Fantasy Football Scout's Team News page. Rows run back to "
      + "front: goalkeeper, defenders, midfielders, forwards. Rows are grouped by our own position for "
      + "each player, not by the source's pitch drawing, because the renderer lays out by position.",
    source: "Fantasy Football Scout",
    source_url: SOURCE_URL,
    captured: new Date().toISOString().slice(0, 10),
    captured_at: new Date().toISOString(),
    official: false,
    confidence: 0.75,
    confidence_note: previousNote
      || "Named players receive 100% predicted start probability. Every non-named player receives 0% "
      + "predicted start probability for the configured gameweek.",
    gameweek,
    orientation: "team_left_to_right",
    _orientation_note: "Each row reads from the team's own left to the team's own right, which is the "
      + "convention the pitch component renders against. The source draws the goalkeeper at the top of "
      + "the frame, so its DOM order is mirrored and every row is reversed on capture. To verify: a "
      + "recognised left back must open a back line and a recognised right back must close it.",
    resolution: {
      player_source: origin,
      clubs_expected: EXPECTED_CLUBS,
      clubs_written: clubs.length,
      clubs_fresh: fresh,
      clubs_carried_forward: carriedForward,
      matched_by_photo_id: viaCode,
      matched_by_name: viaName,
      unmatched: unmatched.length,
      unmatched_names: unmatched.map((u) => `${u.club} ${u.name}`),
      skipped_clubs: failures,
    },
    clubs,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);


  const stale = clubs.filter((c) => !c.updated).length;
  if (failures.length) {
    console.log(`lineups: ${carriedForward.length} club(s) kept their previous entry:`);
    for (const f of failures) console.log(`  ${f}`);
  }
  console.log(`lineups: ${clubs.length} clubs (${fresh} fresh), ${clubs.length * XI_SIZE} players `
    + `(${viaCode} by photo id, ${viaName} by name), ${unmatched.length} unmatched`);
  console.log(`lineups: player data from ${origin}, gameweek ${gameweek}`
    + (stale ? `, ${stale} club(s) with no update date` : ""));
  await beat("ok", `${clubs.length} clubs, ${fresh} fresh, ${carriedForward.length} carried forward`);

  for (const c of clubs) {
    console.log(`  ${c.short} ${c.formation}  updated ${c.updated || "unknown"}`
      + (c.stale ? "  [carried forward]" : "")
      + (c.out?.length ? `  out: ${c.out.join(", ")}` : "")
      + (c.doubts?.length ? `  doubts: ${c.doubts.join(", ")}` : ""));
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

export { parseClubBlocks, parseClub, namedList, layoutFromSource, clean };

if (invokedDirectly) {
  main().catch(async (error) => {
    console.error(error.message);
    await beat("error", error.message);
    process.exit(1);
  });
}
