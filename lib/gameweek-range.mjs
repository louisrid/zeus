import { EXTERNAL_XPTS_GW_TO } from "./external_xpts.mjs";
import { sumGameweekValues } from "./player-query.mjs";

/* The default ceiling is the served horizon, never a literal. A caller that forgets to pass max used to
   silently cap the range at GW8, which was invisible: the control simply stopped offering weeks the data
   could answer. Reading the config means extending the horizon needs no change here. */
export function clampGameweekRange(from, to, min = 1, max = EXTERNAL_XPTS_GW_TO) {
  const low = Number.isFinite(Number(min)) ? Number(min) : 1;
  const high = Math.max(low, Number.isFinite(Number(max)) ? Number(max) : low);
  const start = Math.max(low, Math.min(high, Number.isFinite(Number(from)) ? Number(from) : low));
  const end = Math.max(start, Math.min(high, Number.isFinite(Number(to)) ? Number(to) : start));
  return { from: start, to: end };
}

export function gameweekRangeLabel(from, to) {
  return from === to ? `GW${from}` : `GW${from} TO GW${to}`;
}

export function gameweekWindow(currentGw, fixtureGameweeks = [], limit = EXTERNAL_XPTS_GW_TO) {
  const first = Number.isFinite(Number(currentGw)) ? Number(currentGw) : 1;
  const published = fixtureGameweeks.map(Number).filter(Number.isFinite);
  const seasonLast = published.length ? Math.max(...published) : first;
  return { first, last: Math.max(first, Math.min(seasonLast, first + Math.max(1, limit) - 1)) };
}

export function totalForGameweekRange(player, from, to, scoreForGw) {
  return sumGameweekValues({
    gwFrom: from,
    gwTo: to,
    read: (gw) => scoreForGw(player, gw),
  }).total;
}
