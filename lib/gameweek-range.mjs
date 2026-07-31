export function clampGameweekRange(from, to, min = 1, max = 8) {
  const low = Number.isFinite(Number(min)) ? Number(min) : 1;
  const high = Math.max(low, Number.isFinite(Number(max)) ? Number(max) : low);
  const start = Math.max(low, Math.min(high, Number.isFinite(Number(from)) ? Number(from) : low));
  const end = Math.max(start, Math.min(high, Number.isFinite(Number(to)) ? Number(to) : start));
  return { from: start, to: end };
}

export function gameweekRangeLabel(from, to) {
  return from === to ? `GW${from}` : `GW${from} TO GW${to}`;
}

export function gameweekWindow(currentGw, fixtureGameweeks = [], limit = 8) {
  const first = Number.isFinite(Number(currentGw)) ? Number(currentGw) : 1;
  const published = fixtureGameweeks.map(Number).filter(Number.isFinite);
  const seasonLast = published.length ? Math.max(...published) : first;
  return { first, last: Math.max(first, Math.min(seasonLast, first + Math.max(1, limit) - 1)) };
}

export function totalForGameweekRange(player, from, to, scoreForGw) {
  let total = 0;
  let seen = 0;
  for (let gw = from; gw <= to; gw++) {
    const value = scoreForGw(player, gw);
    if (value === null || value === undefined || !Number.isFinite(Number(value))) continue;
    total += Number(value);
    seen++;
  }
  return seen ? total : null;
}
