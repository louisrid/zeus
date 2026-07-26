// A-01 first pipeline: FPL bootstrap-static + fixtures → teams, players, gameweeks, fixtures.
// Run by .github/workflows/fpl-pull.yml with the SERVICE key (writes bypass RLS).
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

let _db = null;
const supabase = new Proxy({}, { get: (_, k) => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db[k];
} });
const JOB = "fpl_bootstrap";
const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB,
    last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}),
    status, message,
  });
}

async function main() {
  const boot = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { "User-Agent": "fpl-campaign/0.1 (personal project)" },
  }).then((r) => { if (!r.ok) throw new Error(`bootstrap ${r.status}`); return r.json(); });

  // teams
  const teams = boot.teams.map((t) => ({ fpl_id: t.id, name: t.name, short_name: t.short_name, strength: t.strength }));
  let { error } = await supabase.from("teams").upsert(teams, { onConflict: "fpl_id" });
  if (error) throw new Error("teams: " + error.message);

  const { data: teamRows } = await supabase.from("teams").select("id, fpl_id");
  const teamId = Object.fromEntries(teamRows.map((t) => [t.fpl_id, t.id]));

  // gameweeks
  const gws = boot.events.map((e) => ({
    gw: e.id, deadline_utc: e.deadline_time, finished: e.finished, data_checked: e.data_checked,
  }));
  ({ error } = await supabase.from("gameweeks").upsert(gws, { onConflict: "gw" }));
  if (error) throw new Error("gameweeks: " + error.message);

  // price-change detection needs the prices already stored
  const { data: oldRows } = await supabase.from("players").select("id, fpl_id, price");
  const oldPrice = Object.fromEntries((oldRows || []).map((r) => [r.fpl_id, { id: r.id, price: r.price === null ? null : Number(r.price) }]));

  // players (chunked)
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const players = boot.elements.map((p) => ({
    fpl_id: p.id, code: p.code, team_id: teamId[p.team], position: POS[p.element_type],
    name: `${p.first_name} ${p.second_name}`, web_name: p.web_name,
    price: p.now_cost / 10, status: p.status, chance_of_playing: p.chance_of_playing_next_round,
    news: p.news || null, selected_by_pct: parseFloat(p.selected_by_percent),
    total_points: p.total_points, form: num(p.form), ppg: num(p.points_per_game), minutes: p.minutes,
    transfers_in_event: p.transfers_in_event, transfers_out_event: p.transfers_out_event,
    xg_fpl: num(p.expected_goals), xa_fpl: num(p.expected_assists),
    updated_at: new Date().toISOString(),
  }));
  // Validation gate. A row reaching the UI without a current club, a position or a real price is a
  // data bug, not a player, so it is quarantined rather than written. Live rows are explicitly
  // un-archived here so a returning player recovers automatically.
  const currentTeamIds = new Set(Object.values(teamId));
  const good = [], bad = [];
  for (const p of players) {
    const reasons = [];
    if (!p.team_id || !currentTeamIds.has(p.team_id)) reasons.push("club is not a current Premier League club");
    if (!p.position) reasons.push("missing position");
    if (p.price === null || !(Number(p.price) > 0)) reasons.push("zero or missing price");
    if (reasons.length) bad.push({ job_name: JOB, entity: `player ${p.fpl_id} ${p.web_name}`, reason: reasons.join("; "), payload: p });
    else good.push({ ...p, archive: false });
  }
  for (let i = 0; i < good.length; i += 500) {
    ({ error } = await supabase.from("players").upsert(good.slice(i, i + 500), { onConflict: "fpl_id" }));
    // Batch 3: the API overwrites these fields in place, so a daily snapshot is the only history.
    await supabase.from("player_snapshots").upsert(good.slice(i, i + 500).map((r) => ({
      fpl_id: r.fpl_id, price: r.price, status: r.status, chance_of_playing: r.chance_of_playing,
      total_points: r.total_points, form: r.form, ppg: r.ppg, minutes: r.minutes,
      selected_by_pct: r.selected_by_pct,
    })), { onConflict: "fpl_id,snapshot_date" });
    if (error) throw new Error("players: " + error.message);
  }
  // DECISIONS 4.10: availability history. Every change in status, chance of playing or news is
  // recorded, so a player page can show how his availability moved rather than only where it is now.
  // The unique constraint means an unchanged player writes nothing.
  const availability = good
    .filter((p) => p.status !== null && p.status !== undefined)
    .map((p) => ({ player_id: null, fpl_id: p.fpl_id, status: p.status, chance_of_playing: p.chance_of_playing, news: p.news || null }));
  if (availability.length) {
    const { data: idRows } = await supabase.from("players").select("id, fpl_id").not("archive", "is", true);
    const idByFpl = new Map((idRows || []).map((r) => [r.fpl_id, r.id]));
    const rows = availability
      .map((a) => ({ player_id: idByFpl.get(a.fpl_id), status: a.status, chance_of_playing: a.chance_of_playing, news: a.news }))
      .filter((a) => a.player_id);
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("availability_history").upsert(rows.slice(i, i + 500), {
        onConflict: "player_id,status,chance_of_playing,news", ignoreDuplicates: true,
      });
    }
  }

  if (bad.length) {
    await supabase.from("ingest_quarantine").insert(bad);
    console.log(`quarantined ${bad.length} player rows: ${bad.slice(0, 5).map((b) => b.entity).join(", ")}`);
  }

  // price history + transfer velocity snapshots
  const changes = [];
  const velocity = [];
  const nowIso = new Date().toISOString();
  for (const p of boot.elements) {
    const prev = oldPrice[p.id];
    if (prev && prev.price !== null && prev.price !== p.now_cost / 10) {
      changes.push({ player_id: prev.id, date: nowIso.slice(0, 10), old_price: prev.price, new_price: p.now_cost / 10 });
    }
    if (prev && (p.transfers_in_event > 0 || p.transfers_out_event > 0)) {
      velocity.push({ player_id: prev.id, captured_at: nowIso, transfers_in_event: p.transfers_in_event, transfers_out_event: p.transfers_out_event });
    }
  }
  if (changes.length) {
    ({ error } = await supabase.from("player_price_history").insert(changes));
    if (error) throw new Error("price_history: " + error.message);
  }
  for (let i = 0; i < velocity.length; i += 500) {
    ({ error } = await supabase.from("transfer_velocity").insert(velocity.slice(i, i + 500)));
    if (error) throw new Error("transfer_velocity: " + error.message);
  }

  // fixtures
  const fx = await fetch("https://fantasy.premierleague.com/api/fixtures/", {
    headers: { "User-Agent": "fpl-campaign/0.1 (personal project)" },
  }).then((r) => { if (!r.ok) throw new Error(`fixtures ${r.status}`); return r.json(); });
  const fixtures = fx.map((f) => ({
    fpl_id: f.id, gw: f.event, home_team: teamId[f.team_h], away_team: teamId[f.team_a],
    kickoff_utc: f.kickoff_time, finished: f.finished,
    home_goals: f.team_h_score, away_goals: f.team_a_score,
  }));
  for (let i = 0; i < fixtures.length; i += 500) {
    ({ error } = await supabase.from("fixtures").upsert(fixtures.slice(i, i + 500), { onConflict: "fpl_id" }));
    if (error) throw new Error("fixtures: " + error.message);
  }

  await beat("ok", `teams ${teams.length} · players ${good.length} live${bad.length ? `, ${bad.length} quarantined` : ""} · gws ${gws.length} · fixtures ${fixtures.length}`);
  console.log("bootstrap complete:", teams.length, "teams,", players.length, "players,", fixtures.length, "fixtures");
}

// Only run when executed directly.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch(async (e) => {
  console.error(e);
  await beat("error", String(e.message || e));
  process.exit(1);
});
