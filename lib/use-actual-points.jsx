"use client";
import React from "react";

/* ACTUAL POINTS WHERE THEY EXIST, PROJECTIONS ONLY WHERE THEY DO NOT.
 *
 * Every per-gameweek number in this app was a projection, and it stayed a projection after the match had
 * been played. A finished gameweek showed Haaland on 6.6 expected when he had in fact scored 13, and a
 * squad total for a week that had already happened was a forecast of the past. Nothing in the database
 * held the weekly split: players.total_points is a season total.
 *
 * /api/actual-points fetches the official per-gameweek scores and, more importantly, says which state
 * each gameweek is in. That state is the whole decision:
 *
 *   not_started   nothing has kicked off, so the projection is the only answer there is
 *   live          points are real but still moving, and bonus has not landed
 *   finished      the points are final
 *
 * A SINGLE RESOLVER, USED EVERYWHERE. The pitch, the tables, the totals and the transfer search all have
 * to agree about what a gameweek is worth, or the same player reads differently on two screens and
 * neither can be trusted. So nothing calls the projection model directly for a per-gameweek figure any
 * more; it goes through pointsForGw, which decides.
 *
 * FAILURE FALLS BACK TO THE PROJECTION rather than to nothing. If the official API is unreachable the
 * app shows what it always showed instead of a page full of dashes.
 */

export function useActualPoints(gwFrom, gwTo) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    const from = Number(gwFrom);
    const to = Number(gwTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return undefined;

    /* Ten at a time is the route's own ceiling, since each gameweek is a separate call to the official
       API. A wider range asks for the ten that end at the requested finish, because the weeks nearest
       the present are the ones with real points in them. */
    const start = to - from > 9 ? to - 9 : from;

    let cancelled = false;
    fetch(`/api/actual-points?gw_from=${start}&gw_to=${to}`)
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body?.ok) setData(body); })
      /* A failed fetch is not an error state worth showing. Every caller already falls back to the
         projection, which is exactly what it would have shown without this. */
      .catch(() => {});

    /* Live gameweeks move. Nothing else on the page polls, so this is the only thing that refreshes,
       and only while a match is actually in progress. */
    const timer = setInterval(() => {
      fetch(`/api/actual-points?gw_from=${start}&gw_to=${to}`)
        .then((response) => response.json())
        .then((body) => { if (!cancelled && body?.ok) setData(body); })
        .catch(() => {});
    }, 120000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [gwFrom, gwTo]);

  return data;
}

/* What a gameweek is worth for one player, and whether that figure is real or expected.
 *
 * Returns { value, actual, state }. `actual` is what the callers key their styling off: a real score and
 * a projection must not look identical, or a reader cannot tell a fact from a forecast. */
export function pointsForGw(actuals, player, gw, projectedValue) {
  const week = actuals?.weeks?.[gw] ?? actuals?.weeks?.[String(gw)] ?? null;
  const state = week?.state || "not_started";

  if (state === "not_started" || !week?.players) {
    return { value: projectedValue ?? null, actual: false, state };
  }

  const id = Number(player?.fpl_id ?? player?.id);
  const row = week.players[id] ?? week.players[String(id)];
  if (!row) {
    /* In the squad but not in the official response: he was not registered for that gameweek. Zero is
       the honest answer for a played week, not the projection he never had a chance to earn. */
    return { value: 0, actual: true, state };
  }
  return { value: Number(row.points) || 0, actual: true, state, stats: row };
}

/* The same decision across a range, summed. Mixed ranges are the normal case in this app: GW3 finished,
 * GW4 live, GW5 not played. The total is the sum of whatever each week's best answer is, and it reports
 * how many of those weeks were real so a caller can say so rather than implying the whole figure is. */
export function pointsOverRange(actuals, player, from, to, projectedForGw) {
  let total = 0;
  let settled = 0;
  let weeks = 0;
  for (let gw = Number(from); gw <= Number(to); gw += 1) {
    const projected = projectedForGw ? projectedForGw(player, gw) : null;
    const { value, actual } = pointsForGw(actuals, player, gw, projected);
    if (value === null || value === undefined) continue;
    total += Number(value);
    weeks += 1;
    if (actual) settled += 1;
  }
  return { total, settled, weeks, mixed: settled > 0 && settled < weeks };
}
