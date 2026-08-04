/* ZEUS FPL BRIEF.
 *
 * Plain text remains available for language-model readers. JSON clients use the stable structured contract.
 * External xPTS is gated by the published predicted line-ups. Fixtures, prices, ownership and saved plans
 * remain live. Saved-squad retrieval and chip simulation are exposed through view=squads.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import {
  GET as stableFplBriefGet,
  POST as stableFplBriefPost,
  OPTIONS as stableFplBriefOptions,
} from "../../../lib/server/fpl_brief_api.mjs";
import { buildSavedSquadsPayload, savedPlansOnly, selectSavedPlan } from "../../../lib/server/squad-brief.mjs";
import { EXTERNAL_XPTS_GW_TO, EXTERNAL_XPTS_SOURCE } from "../../../lib/external_xpts.mjs";

export const dynamic = "force-dynamic";

const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const env = (...keys) => keys.map((key) => process.env[key]).find((value) => value && String(value).trim());

function briefAuthOkay(request) {
  const expected = env(
    "ZEUS_API_KEY", "FPL_BRIEF_API_KEY", "FPLBOT_API_KEY", "FPL_API_KEY",
    "OPENWEBUI_API_KEY", "ZEUS_API_TOKEN", "FPL_API_SECRET",
  ) || "";
  if (!expected) return true;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-api-key")
    || request.headers.get("x-zeus-api-key")
    || request.headers.get("x-fpl-api-key")
    || request.headers.get("authorization")
    || url.searchParams.get("api_key")
    || url.searchParams.get("key")
    || "";
  return supplied === expected || supplied === `Bearer ${expected}`;
}

async function parameters(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  if (request.method === "POST") {
    try {
      const body = await request.clone().json();
      if (body && typeof body === "object") Object.assign(params, body);
    } catch {}
  }
  return params;
}

function wantsJsonBrief(request, params = {}) {
  const format = String(params.format || "").toLowerCase();
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  return format === "json" || accept.includes("application/json");
}

function validGw(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

async function savedSquadsResponse(request, params) {
  if (!briefAuthOkay(request)) {
    return Response.json({ ok: false, success: false, view: "squads", error: "Unauthorized" }, { status: 401 });
  }
  const data = await loadForServer();
  const hasFrom = params.gw_from !== undefined && params.gw_from !== null && params.gw_from !== "";
  const hasTo = params.gw_to !== undefined && params.gw_to !== null && params.gw_to !== "";
  if (hasFrom !== hasTo) {
    return Response.json({ ok: false, view: "squads", error: "gw_from and gw_to must be supplied together." }, { status: 400 });
  }
  const exactInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
  };
  const rawSimulateChip = params.simulate_chip === undefined || params.simulate_chip === null
    ? null
    : String(params.simulate_chip).toLowerCase().replace(/[\s_-]+/g, "");
  const simulateChip = rawSimulateChip === "triplecap" ? "triplecaptain" : rawSimulateChip;
  const supportedSimulationChips = new Set(["wildcard", "benchboost", "triplecaptain"]);
  if (simulateChip && !supportedSimulationChips.has(simulateChip)) {
    return Response.json({ ok: false, view: "squads", error: "simulate_chip must be wildcard, benchboost or triplecaptain." }, { status: 400 });
  }
  const hasSimulateGw = params.simulate_gw !== undefined && params.simulate_gw !== null && params.simulate_gw !== "";
  if (hasSimulateGw && !simulateChip) {
    return Response.json({ ok: false, view: "squads", error: "simulate_gw requires simulate_chip." }, { status: 400 });
  }
  const parsedSimulateGw = hasSimulateGw ? exactInteger(params.simulate_gw) : null;
  const requestedGw = validGw(params.gw ?? params.gameweek, data.gw);
  const gwFrom = hasFrom ? exactInteger(params.gw_from) : (parsedSimulateGw ?? requestedGw);
  const gwTo = hasTo ? exactInteger(params.gw_to) : gwFrom;
  const simulateGw = simulateChip ? (parsedSimulateGw ?? gwFrom) : null;
  const hasExplicitGw = params.gw !== undefined || params.gameweek !== undefined;
  const gw = hasExplicitGw && hasFrom
    ? exactInteger(params.gw ?? params.gameweek)
    : (simulateGw ?? gwFrom);
  if (!Number.isInteger(gwFrom) || !Number.isInteger(gwTo) || !Number.isInteger(gw)
    || gwFrom < 1 || gwTo > EXTERNAL_XPTS_GW_TO || gwTo < gwFrom
    || gw < gwFrom || gw > gwTo
    || (simulateGw !== null && (!Number.isInteger(simulateGw) || simulateGw < gwFrom || simulateGw > gwTo))) {
    return Response.json({
      ok: false,
      view: "squads",
      error: `Saved-squad ranges and simulations must be exact inclusive ranges within GW1-GW${EXTERNAL_XPTS_GW_TO}.`,
    }, { status: 400 });
  }
  const includePlayers = String(params.include_players ?? "true").toLowerCase() !== "false";
  const payload = buildSavedSquadsPayload({
    plans: data.plans,
    players: data.players,
    scorer: data.scorer,
    gw,
    gwFrom,
    gwTo,
    selector: params.plan ?? params.squad ?? null,
    planId: params.plan_id ?? params.squad_id ?? null,
    simulateChip,
    simulateGw,
    includePlayers,
  });
  return Response.json({
    ok: true,
    success: true,
    view: "squads",
    gw,
    gw_from: gwFrom,
    gw_to: gwTo,
    simulate_gw: simulateGw,
    generated_at: new Date().toISOString(),
    source: EXTERNAL_XPTS_SOURCE,
    lineup_gate: data.scorer.lineupGate?.report || null,
    saved_squad_count: payload.saved_squad_count,
    available_squads: payload.available_squads,
    selected_squad: payload.selected_squad,
    usage: {
      all_saved_squads: "/api/brief?view=squads&gw=1",
      by_name_or_index: "/api/brief?view=squads&gw=1&plan=1",
      by_id: "/api/brief?view=squads&gw=1&plan_id=12",
      exact_range: "/api/brief?view=squads&gw_from=1&gw_to=4&plan=active",
      simulate_bench_boost: "/api/brief?view=squads&gw_from=1&gw_to=4&plan=active&simulate_chip=benchboost&simulate_gw=3",
      simulate_wildcard: "/api/brief?view=squads&gw_from=1&gw_to=4&plan=active&simulate_chip=wildcard&simulate_gw=3",
      simulate_triple_captain: "/api/brief?view=squads&gw_from=1&gw_to=4&plan=active&simulate_chip=triplecaptain&simulate_gw=3",
    },
  });
}

async function textBrief(request, params) {
  const requestedWeeks = Math.max(1, Number(params.weeks) || 6);
  const depth = Math.max(5, Math.min(30, Number(params.depth) || 12));
  const { teamRows, teamById, players, fixtures, gw, scorer, plans } = await loadForServer();
  if (gw > EXTERNAL_XPTS_GW_TO) {
    return new Response(`External xPTS is temporarily available only for GW1-GW${EXTERNAL_XPTS_GW_TO}.`, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const weeks = Math.min(requestedWeeks, EXTERNAL_XPTS_GW_TO - gw + 1);
  const lastGw = gw + weeks - 1;
  const lines = [];
  const xpOne = (player) => Number(scorer.scoreForGw(player, gw)) || 0;
  const xpWindow = (player) => {
    let total = 0;
    for (let gameweek = gw; gameweek <= lastGw; gameweek += 1) {
      const value = scorer.scoreForGw(player, gameweek);
      if (Number.isFinite(Number(value))) total += Number(value);
    }
    return total;
  };

  lines.push("FPL BRIEF");
  lines.push(`Source: ${EXTERNAL_XPTS_SOURCE}. Predicted line-ups gate effective xPTS.`);
  lines.push(`Available projection window: GW1-GW${EXTERNAL_XPTS_GW_TO}. This brief covers GW${gw}-GW${lastGw}.`);
  lines.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
  lines.push("");

  const savedPlans = savedPlansOnly(plans);
  const activePlan = savedPlans.find((x) => x.is_active) || null;
  const selectedPlan = selectSavedPlan(savedPlans, params.plan ?? null, params.plan_id ?? null)
    || activePlan || savedPlans[0] || null;
  lines.push(`SAVED SQUADS (${savedPlans.length})`);
  if (!savedPlans.length) {
    lines.push("  No saved squad is available.");
  } else {
    savedPlans.forEach((plan, index) => {
      lines.push(`  ${index + 1}. ${plan.name || "unnamed draft"}${plan.is_active ? " (active)" : ""} · ${(plan.base || []).length}/15`);
    });
  }
  lines.push("");

  const squadPayload = buildSavedSquadsPayload({
    plans: savedPlans,
    players,
    scorer,
    gw,
    planId: selectedPlan ? selectedPlan.id : null,
    simulateChip: params.simulate_chip ?? null,
    includePlayers: true,
  });
  const selected = squadPayload.selected_squad;
  lines.push("SELECTED SQUAD");
  if (!selected) {
    lines.push("  No saved squad is available.");
  } else {
    lines.push(`  ${selected.plan_name}${selected.is_active ? " (active)" : ""}`);
    lines.push(`  GW${gw} chip: ${selected.chip || "none"}. Transfers: ${selected.transfers_made}. Transfer cost: -${n1(selected.transfer_hit)}.`);
    lines.push(`  Starting XI ${n1(selected.starting_xpts)} · captain bonus ${n1(selected.captain_bonus)} · bench boost ${n1(selected.bench_boost_bonus)} · net ${n1(selected.net_xpts)} xPTS.`);
    if (selected.simulation) {
      lines.push(`  Simulation only: ${selected.simulation.chip} = ${n1(selected.simulation.net_xpts)} xPTS (${selected.simulation.difference >= 0 ? "+" : ""}${n1(selected.simulation.difference)}).`);
    }
    for (const player of selected.players || []) {
      lines.push(`  ${player.starting ? "XI" : "BENCH"} · ${player.name}, ${player.position}, ${player.club}, £${n1(player.price)}, ${n1(player.xpts)} xPTS, start ${n1((player.start_probability ?? 0) * 100)}%${player.captain ? ", captain" : ""}${player.vice_captain ? ", vice" : ""}`);
    }
  }
  lines.push("");

  lines.push(`TOP ${depth} PER POSITION`);
  lines.push("  name, club, price, ownership, effective xPTS this week, effective xPTS over window, start probability");
  for (const position of ["GKP", "DEF", "MID", "FWD"]) {
    lines.push(`  ${position}`);
    const ranked = players
      .filter((player) => player.position === position)
      .map((player) => ({ player, one: xpOne(player), total: xpWindow(player) }))
      .sort((a, b) => b.total - a.total || b.one - a.one || a.player.web_name.localeCompare(b.player.web_name))
      .slice(0, depth);
    for (const row of ranked) {
      const probability = scorer.startProbForGw ? scorer.startProbForGw(row.player, gw) : null;
      lines.push(`    ${row.player.web_name}, ${row.player.team}, £${n1(row.player.price)}, ${n1(row.player.own)}%, ${n1(row.one)}, ${n1(row.total)}, ${n1((probability ?? 0) * 100)}%`);
    }
  }
  lines.push("");

  lines.push(`FIXTURES GW${gw}-GW${lastGw}`);
  for (const team of [...teamRows].sort((a, b) => String(a.short_name || "").localeCompare(String(b.short_name || "")))) {
    const fixtureList = [];
    for (let gameweek = gw; gameweek <= lastGw; gameweek += 1) {
      const gameweekFixtures = fixtures.filter((fixture) => Number(fixture.gw) === gameweek
        && (Number(fixture.home_team) === Number(team.id) || Number(fixture.away_team) === Number(team.id)));
      if (!gameweekFixtures.length) {
        fixtureList.push("BLANK");
        continue;
      }
      fixtureList.push(gameweekFixtures.map((fixture) => {
        const home = Number(fixture.home_team) === Number(team.id);
        const opponent = teamById[home ? Number(fixture.away_team) : Number(fixture.home_team)];
        return `${opponent?.short_name || "?"}${home ? "(H)" : "(A)"}`;
      }).join("+"));
    }
    lines.push(`  ${team.short_name}: ${fixtureList.join(" ")}`);
  }
  lines.push("");
  lines.push("A named predicted starter has start probability 1.0. Every other player has effective xPTS and start probability 0.0.");
  lines.push(`GW${EXTERNAL_XPTS_GW_TO + 1}-GW38 xPTS is disabled rather than filled from the old ZEUS model.`);

  return new Response(lines.join("\n"), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request) {
  const params = await parameters(request);
  if (String(params.view || "").toLowerCase() === "squads") {
    try { return await savedSquadsResponse(request, params); }
    catch (error) {
      return Response.json({ ok: false, view: "squads", error: error instanceof Error ? error.message : String(error) }, { status: Number(error?.status) || 500 });
    }
  }
  if (wantsJsonBrief(request, params)) return stableFplBriefGet(request);
  try {
    return await textBrief(request, params);
  } catch (error) {
    return new Response(`The brief could not be built: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export async function POST(request) {
  const params = await parameters(request);
  if (String(params.view || "").toLowerCase() === "squads") {
    try { return await savedSquadsResponse(request, params); }
    catch (error) {
      return Response.json({ ok: false, view: "squads", error: error instanceof Error ? error.message : String(error) }, { status: Number(error?.status) || 500 });
    }
  }
  return stableFplBriefPost(request);
}

export const OPTIONS = stableFplBriefOptions;
