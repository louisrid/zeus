/* BLANKS AND DOUBLES.
 *
 * Kept in its own file with no JSON imports, so it can be tested in Node. A module that imports JSON needs an
 * attribute Node requires and webpack rejects, which has already broken a page once and blocked a test twice.
 *
 * Chip timing is mostly this question and nothing computed it before. A club with no fixture in a gameweek
 * blanks; a club with two or more plays twice. Bench boost wants a double, free hit wants a blank.
 */
/* Rows at or above this id were written by the 2025/26 archive job. They store one side of a match only, so
   counting them invents a double gameweek for half the league. lib/data.js holds the same constant for the
   browser; it cannot be imported here because that file is client-marked, and a test asserts the two agree. */
export const ARCHIVE_OFFSET = 1000000;

export function fixtureCounts(fixtures, firstGw, lastGw) {
  const counts = new Map();
  for (const f of fixtures || []) {
    const gw = Number(f.gw);
    if (!Number.isFinite(gw) || gw < firstGw || gw > lastGw) continue;
    for (const id of [f.home_team, f.away_team]) {
      if (id === null || id === undefined) continue;
      const key = `${id}:${gw}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

export function blanksAndDoubles(fixtures, teamIds, firstGw, lastGw) {
  const counts = fixtureCounts(fixtures, firstGw, lastGw);
  const blanks = new Map(), doubles = new Map();
  for (let gw = firstGw; gw <= lastGw; gw++) {
    const b = [], d = [];
    for (const id of teamIds || []) {
      const n = counts.get(`${id}:${gw}`) || 0;
      if (n === 0) b.push(id);
      else if (n >= 2) d.push(id);
    }
    if (b.length) blanks.set(gw, b);
    if (d.length) doubles.set(gw, d);
  }
  return { blanks, doubles, counts };
}
