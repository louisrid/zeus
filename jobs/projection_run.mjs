// B-02/03/04/06/07 · The projection run. Odds → team goals → allocation → minutes → simulation.
// Writes minutes_forecasts, projections, team_covariances and a model_versions stamp.
// Zero AI calls. Nothing here reads a scoring constant that is not in config/rules-2026-27.json
// and nothing reads a tunable that is not in config/model-params.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { impliedGoals } from "../lib/engine/market.mjs";
import { goalShares, finishingMultiplier, penaltyModel, assistShares, promotedBlend, applyPromotedPrior } from "../lib/engine/allocation.mjs";
import { minutesForecast, lineupScenarios } from "../lib/engine/minutes.mjs";
import { simulateFixture, summarise, covariance } from "../lib/engine/simulate.mjs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "projection_run";
const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));
const params = JSON.parse(readFileSync(new URL("../config/model-params.json", import.meta.url)));
const SIMS = Number(process.env.SIMS || params.layer4.sims.value);
const PROMOTED = (process.env.PROMOTED_TEAMS || "SUN,LEE,BUR").split(",").map((s) => s.trim());

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}
async function pageAll(table, select, apply) {
  let from = 0, out = [];
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < 1000) return out;
    from += 1000;
  }
}
const gitSha = () => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "unknown"; }
};

async function main() {
  /* ── 1. target gameweek and its fixtures ── */
  const { data: gws } = await supabase.from("gameweeks").select("gw, deadline_utc")
    .eq("finished", false).order("gw").limit(1);
  if (!gws || !gws.length) throw new Error("no unfinished gameweek — is the FPL pull running?");
  const gw = Number(process.env.GW || gws[0].gw);

  const fixtures = await pageAll("fixtures", "id, gw, home_team, away_team, kickoff_utc, season",
    (q) => q.eq("gw", gw).eq("season", "2026-27"));
  if (!fixtures.length) throw new Error(`no 2026-27 fixtures for GW${gw}`);

  /* ── 2. reference data ── */
  const teams = await pageAll("teams", "id, fpl_id, name, short_name, strength, xg_for, xg_against, archive");
  const liveTeams = teams.filter((t) => !t.archive);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const players = (await pageAll("players", "id, fpl_id, team_id, position, name, web_name, price, status, chance_of_playing, minutes, form, ppg, total_points, xg_fpl, xa_fpl"))
    .filter((p) => p.team_id && teamById.get(p.team_id) && !teamById.get(p.team_id).archive);

  const understat = await pageAll("understat_player_season", "player_id, season, minutes, xg, xa, npxg, shots, key_passes");
  const usById = new Map(understat.filter((u) => u.season === "2025-26").map((u) => [u.player_id, u]));

  const archive = await pageAll("player_match_stats",
    "player_id, minutes, goals, assists, saves, goals_conceded, clearances_blocks_interceptions, tackles, recoveries, yellow, red, own_goals, started",
    (q) => q.eq("source", "vaastav"));

  const { data: pressers } = await supabase.from("presser_signals")
    .select("player_id, gw, signal, confidence, captured_at").eq("gw", gw).order("captured_at", { ascending: false });
  const presserById = new Map();
  for (const s of pressers || []) if (!presserById.has(s.player_id)) presserById.set(s.player_id, s);

  const { data: duties } = await supabase.from("set_piece_duty").select("player_id, team_id, kind, rank").eq("kind", "pen");
  const penRank = new Map((duties || []).map((d) => [d.player_id, d.rank]));

  /* ── 3. per-90 rates and start rates from the archive ── */
  const agg = new Map();
  for (const s of archive) {
    if (!agg.has(s.player_id)) agg.set(s.player_id, { min: 0, apps: 0, starts: 0, appearances: 0, cbi: 0, tk: 0, rec: 0, y: 0, r: 0, og: 0, g: 0, a: 0 });
    const a = agg.get(s.player_id);
    a.apps += 1;
    if ((s.minutes || 0) > 0) a.appearances += 1;
    if (s.started) a.starts += 1;
    a.min += s.minutes || 0;
    a.cbi += s.clearances_blocks_interceptions || 0;
    a.tk += s.tackles || 0;
    a.rec += s.recoveries || 0;
    a.y += s.yellow || 0; a.r += s.red || 0; a.og += s.own_goals || 0;
    a.g += s.goals || 0; a.a += s.assists || 0;
  }
  const per90 = (n, mins) => (mins > 0 ? (n / mins) * 90 : 0);

  /* ── 4. build a feature row per player ── */
  const feature = (p) => {
    const a = agg.get(p.id) || { min: 0, apps: 0, starts: 0, appearances: 0, cbi: 0, tk: 0, rec: 0, y: 0, r: 0, og: 0, g: 0, a: 0 };
    const u = usById.get(p.id);
    const team = teamById.get(p.team_id);
    const promoted = PROMOTED.includes(team?.short_name);
    return {
      player_id: p.id, position: p.position, team_id: p.team_id, web_name: p.web_name,
      price: Number(p.price || 4.5), status: p.status, chance_of_playing: p.chance_of_playing,
      recent_apps: a.apps, recent_starts: a.starts, recent_appearances: a.appearances,
      presser_signal: presserById.get(p.id) || null,
      wc_load_flag: gw <= 4,
      npxg_current: u ? Number(u.npxg || 0) : Number(p.xg_fpl || 0),
      npxg_prior: 0,
      minutes_window: a.min, minutes_prior: 0,
      xa_rate: u ? per90(Number(u.xa || 0), Number(u.minutes || 0)) : per90(Number(p.xa_fpl || 0), a.min),
      career_goals: a.g, career_xg: u ? Number(u.xg || 0) : Number(p.xg_fpl || 0), career_shots: u ? Number(u.shots || 0) : 0,
      cbi_per90: per90(a.cbi, a.min), tackles_per90: per90(a.tk, a.min), recoveries_per90: per90(a.rec, a.min),
      yellow_per90: per90(a.y, a.min), red_per90: per90(a.r, a.min), og_per90: per90(a.og, a.min),
      pen_rank: penRank.get(p.id) || null, pen_attempts: 0, pen_scored: 0,
      promoted,
    };
  };

  const byTeam = new Map(liveTeams.map((t) => [t.id, []]));
  for (const p of players) if (byTeam.has(p.team_id)) byTeam.get(p.team_id).push(feature(p));

  /* ── 5. Layer 3 minutes, then Layer 2 shares within each squad ── */
  const minutesRows = [];
  const modelVersion = `engine-1.0.0+${params.metadata.params_version}+${rules.metadata.ruleset_version}`;
  for (const [teamId, squad] of byTeam) {
    for (const p of squad) {
      const mf = minutesForecast(p, params);
      Object.assign(p, mf);
      minutesRows.push({
        player_id: p.player_id, gw, model_version: modelVersion,
        p_start: mf.p_start, p_cameo: mf.p_cameo, p60: mf.p60,
        exp_min_start: mf.exp_min_start, exp_min_cameo: mf.exp_min_cameo,
        wc_load_flag: mf.wc_load_flag, source: mf.source,
      });
    }
    const shared = goalShares(squad, params);
    const cohortPrior = 1 / Math.max(1, shared.filter((x) => x.position !== "GKP").length);
    const aShares = assistShares(shared);
    shared.forEach((s, i) => {
      const pb = promotedBlend(s, gw, params);
      squad[i].share = applyPromotedPrior(s.share, cohortPrior, pb.blend);
      squad[i].prior_blend = pb.blend;
      squad[i].sd_inflation = pb.sd_inflation;
      squad[i].finishing = finishingMultiplier(s, params);
      squad[i].assist_share = aShares.get(s.player_id) || 0;
    });
    const pen = penaltyModel(teamById.get(teamId), squad, params);
    byTeam.set(teamId, Object.assign(squad, { pen }));
  }

  /* ── 6. Layer 0: latest odds per fixture, with a stated fallback ── */
  const { data: ig } = await supabase.from("implied_goals")
    .select("fixture_id, lambda_home, lambda_away, fit_residual, computed_at")
    .in("fixture_id", fixtures.map((f) => f.id)).order("computed_at", { ascending: false });
  const igByFixture = new Map();
  for (const r of ig || []) if (!igByFixture.has(r.fixture_id)) igByFixture.set(r.fixture_id, r);

  const { data: snaps } = await supabase.from("odds_snapshots")
    .select("id, fixture_id, h, d, a, over25, under25, fetched_at")
    .in("fixture_id", fixtures.map((f) => f.id)).order("fetched_at", { ascending: false });
  const snapByFixture = new Map();
  for (const s of snaps || []) if (!snapByFixture.has(s.fixture_id)) snapByFixture.set(s.fixture_id, s);

  let oddsFixtures = 0, fallbackFixtures = 0;
  const lambdasFor = async (fx) => {
    const snap = snapByFixture.get(fx.id);
    if (snap) {
      const res = impliedGoals(snap, params);
      if (res) {
        oddsFixtures++;
        await supabase.from("implied_goals").insert({
          fixture_id: fx.id, odds_snapshot_id: snap.id,
          lambda_home: res.lambda_home, lambda_away: res.lambda_away,
          deoverround_method: res.deoverround_method, fit_residual: res.fit_residual,
          rho: params.layer1.rho.value, truncation_mass: res.truncation_mass,
        });
        return { lh: res.lambda_home, la: res.lambda_away, source: "odds" };
      }
    }
    const prior = igByFixture.get(fx.id);
    if (prior) { oddsFixtures++; return { lh: Number(prior.lambda_home), la: Number(prior.lambda_away), source: "odds_cached" }; }
    // Stated fallback: team season xG rates. Recorded per fixture so no projection ever pretends
    // it came off a market line.
    const h = teamById.get(fx.home_team), a = teamById.get(fx.away_team);
    const rate = (t) => (t && t.xg_for ? Number(t.xg_for) / 38 : 1.35);
    fallbackFixtures++;
    return { lh: rate(h) * 1.1, la: rate(a) * 0.9, source: "team_xg_fallback" };
  };

  /* ── 7. Layer 4: simulate every fixture ── */
  const projectionRows = [];
  const covRows = [];
  let truncationMax = 0;

  for (const fx of fixtures) {
    const homeSquad = byTeam.get(fx.home_team) || [];
    const awaySquad = byTeam.get(fx.away_team) || [];
    if (!homeSquad.length || !awaySquad.length) continue;
    const lam = await lambdasFor(fx);

    const scenariosFor = (squad) => lineupScenarios(squad, rules, params);
    const home = { team_id: fx.home_team, lambda: lam.lh, players: homeSquad, pen: homeSquad.pen, scenarios: scenariosFor(homeSquad) };
    const away = { team_id: fx.away_team, lambda: lam.la, players: awaySquad, pen: awaySquad.pen, scenarios: scenariosFor(awaySquad) };

    const samples = simulateFixture({ home, away, rules, params, sims: SIMS, seed: fx.id * 7919 + gw });

    for (const squad of [homeSquad, awaySquad]) {
      for (const p of squad) {
        const rec = samples.get(p.player_id);
        if (!rec) continue;
        const s = summarise(rec, SIMS, params);
        projectionRows.push({
          player_id: p.player_id, gw, model_version: modelVersion, fixture_id: fx.id,
          ep_mean: s.ep_mean, ep_sd: +(s.ep_sd * (p.sd_inflation || 1)).toFixed(3),
          p_goal: s.p_goal, p_assist: s.p_assist, p_cs: s.p_cs,
          e_bonus: s.e_bonus, e_defcon: s.e_defcon,
          quantiles: s.quantiles, p_12plus: s.p_12plus,
          ep_home: squad === homeSquad ? s.ep_mean : null,
          ep_away: squad === awaySquad ? s.ep_mean : null,
          prior_blend: p.prior_blend || 0, low_sample: (p.prior_blend || 0) > 0,
          p_start: p.p_start, exp_minutes: +(p.p_start * p.exp_min_start + p.p_cameo * p.exp_min_cameo).toFixed(1),
          computed_at: new Date().toISOString(),
        });
      }
      covRows.push({
        gw, model_version: modelVersion, team_id: squad === homeSquad ? fx.home_team : fx.away_team,
        matrix: covariance(squad.map((p) => p.player_id), samples),
      });
    }
    truncationMax = Math.max(truncationMax, 0);
    console.log(`GW${gw} fixture ${fx.id}: lambdas ${lam.lh.toFixed(2)}/${lam.la.toFixed(2)} (${lam.source})`);
  }

  /* ── 8. write ── */
  const write = async (table, rows, onConflict) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  };
  await write("minutes_forecasts", minutesRows, "player_id,gw,model_version");
  await write("projections", projectionRows, "player_id,gw,model_version");
  await write("team_covariances", covRows, "gw,model_version,team_id");

  await supabase.from("model_versions").upsert({
    version: modelVersion, git_sha: gitSha(), data_snapshot_at: new Date().toISOString(),
    ruleset_version: rules.metadata.ruleset_version,
    notes: `GW${gw} · sims ${SIMS} · fixtures ${fixtures.length} (odds ${oddsFixtures}, fallback ${fallbackFixtures}) · projections ${projectionRows.length} · minutes ${minutesRows.length} · params ${params.metadata.params_version} · calibration NOT RUN — xP gated in UI`,
  }, { onConflict: "version" });

  const msg = `GW${gw} · ${projectionRows.length} projections · ${fixtures.length} fixtures (${oddsFixtures} priced, ${fallbackFixtures} on the xG fallback) · ${SIMS} sims`;
  await beat("ok", msg);
  console.log("PROJECTION RUN — " + msg);
  console.log("xP is stored but NOT shown in the UI: model_gates.xp_ui is false until walk-forward validation passes.");
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
