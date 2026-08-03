/* ZEUS FPL BRIEF.
 *
 * The default response remains plain text for language-model readers. JSON clients and custom tools use the
 * stable structured contract via ?format=json, Accept: application/json, or POST. Both paths now read only
 * the imported external GW1-GW8 xPTS dataset. Fixtures, prices, ownership and saved plans remain live.
 */
import { loadForServer } from "../../../lib/server/load.mjs";
import {
  GET as stableFplBriefGet,
  POST as stableFplBriefPost,
  OPTIONS as stableFplBriefOptions,
} from "../../../lib/server/fpl_brief_api.mjs";
import { EXTERNAL_XPTS_GW_TO, EXTERNAL_XPTS_SOURCE } from "../../../lib/external_xpts.mjs";

export const dynamic = "force-dynamic";

const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";

function wantsJsonBrief(request) {
  const url = new URL(request.url);
  const format = String(url.searchParams.get("format") || "").toLowerCase();
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  return format === "json" || accept.includes("application/json");
}

async function textBrief(request) {
  const url = new URL(request.url);
  const requestedWeeks = Math.max(1, Number(url.searchParams.get("weeks")) || 6);
  const depth = Math.max(5, Math.min(30, Number(url.searchParams.get("depth")) || 12));
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
  lines.push(`Source: ${EXTERNAL_XPTS_SOURCE}. Internal ZEUS projection maths is paused.`);
  lines.push(`Available projection window: GW1-GW${EXTERNAL_XPTS_GW_TO}. This brief covers GW${gw}-GW${lastGw}.`);
  lines.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`);
  lines.push("");

  const activePlan = (plans || []).find((plan) => plan.is_active) || (plans || [])[0] || null;
  lines.push("YOUR SAVED SQUAD");
  if (!activePlan) {
    lines.push("  No saved draft is available.");
  } else {
    const base = Array.isArray(activePlan.base) ? activePlan.base : [];
    const byId = new Map(players.map((player) => [Number(player.fpl_id), player]));
    lines.push(`  ${activePlan.name || "unnamed draft"}`);
    for (const item of base) {
      const player = byId.get(Number(item.fpl_id));
      if (!player) continue;
      lines.push(`  ${player.web_name}, ${player.position}, ${player.team}, £${n1(player.price)}, ${n1(xpOne(player))} GW${gw}, ${n1(xpWindow(player))} GW${gw}-GW${lastGw}`);
    }
  }
  lines.push("");

  lines.push(`TOP ${depth} PER POSITION`);
  lines.push("  name, club, price, ownership, xPTS this week, xPTS over window, imported minutes this week");
  for (const position of ["GKP", "DEF", "MID", "FWD"]) {
    lines.push(`  ${position}`);
    const ranked = players
      .filter((player) => player.position === position)
      .map((player) => ({ player, one: xpOne(player), total: xpWindow(player) }))
      .sort((a, b) => b.total - a.total || b.one - a.one || a.player.web_name.localeCompare(b.player.web_name))
      .slice(0, depth);
    for (const row of ranked) {
      const mins = scorer.minutesForGw ? scorer.minutesForGw(row.player, gw) : null;
      lines.push(`    ${row.player.web_name}, ${row.player.team}, £${n1(row.player.price)}, ${n1(row.player.own)}%, ${n1(row.one)}, ${n1(row.total)}, ${n1(mins)}`);
    }
  }
  lines.push("");

  lines.push(`FIXTURES GW${gw}-GW${lastGw}`);
  for (const team of [...teamRows].sort((a, b) => String(a.short_name || "").localeCompare(String(b.short_name || "")))) {
    const run = [];
    for (let gameweek = gw; gameweek <= lastGw; gameweek += 1) {
      const gameweekFixtures = fixtures.filter((fixture) => Number(fixture.gw) === gameweek
        && (Number(fixture.home_team) === Number(team.id) || Number(fixture.away_team) === Number(team.id)));
      if (!gameweekFixtures.length) {
        run.push("BLANK");
        continue;
      }
      run.push(gameweekFixtures.map((fixture) => {
        const home = Number(fixture.home_team) === Number(team.id);
        const opponent = teamById[home ? Number(fixture.away_team) : Number(fixture.home_team)];
        return `${opponent?.short_name || "?"}${home ? "(H)" : "(A)"}`;
      }).join("+"));
    }
    lines.push(`  ${team.short_name}: ${run.join(" ")}`);
  }
  lines.push("");
  lines.push("Imported minutes are display and selection metadata only. They do not alter xPTS.");
  lines.push(`GW${EXTERNAL_XPTS_GW_TO + 1}-GW38 xPTS is disabled rather than filled from the old ZEUS model.`);

  return new Response(lines.join("\n"), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request) {
  if (wantsJsonBrief(request)) return stableFplBriefGet(request);
  try {
    return await textBrief(request);
  } catch (error) {
    return new Response(`The brief could not be built: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export const POST = stableFplBriefPost;
export const OPTIONS = stableFplBriefOptions;
