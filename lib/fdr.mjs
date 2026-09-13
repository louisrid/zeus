import FDR from "../config/fdr-2026-27.mjs";

/* HOW HARD A CLUB'S FIXTURES ARE, OVER A RANGE, ON ONE SCALE.
 *
 * The FDR endpoint already works this out for its own table. Filtering a player list by it needs the same
 * arithmetic, and two copies of it would eventually disagree: a player who passes a rule on one screen and
 * fails it on another is worse than no rule at all. So the calculation lives here and both use it.
 *
 * ONE NUMBER, ONE TO FIVE, LOW IS EASY. That is the scale the game itself uses and every FPL reader
 * already reads fluently. It is the official opponent rating shifted by how strong the club itself is,
 * so Arsenal facing Hull is not the same fixture as Ipswich facing Hull, which is the whole reason the
 * official figure cannot answer "whose run is easier".
 */

/* Centred on 3, the middle of the official scale, and clamped to it, so the answer is always a number an
 * FPL reader recognises rather than something like -0.4 or 7. */
function scoreOf(match) {
  if (match?.relative === null || match?.relative === undefined) return null;
  return Math.min(5, Math.max(1, 3 + Number(match.relative)));
}

/* The average across the range. A blank gameweek contributes nothing rather than a zero: no fixture is
 * not an easy fixture, and averaging a zero in would make a blank look like the easiest week of the
 * season. Returns null when a club has no rated fixture in the window at all, so a condition excludes it
 * rather than treating "unknown" as "easy". */
/* NAMED FOR ITS SCALE, because there is another one.
 *
 * lib/fixture-difficulty.mjs also exports a fixtureDifficulty, on a nought-to-hundred scale, for the
 * brief API. Two functions with the same name and different scales is how somebody eventually imports
 * the wrong one and gets a number that looks plausible and means something else. This one is one to five,
 * the scale the game uses, and says so in its name. */
export function clubFixtureDifficulty(club, gwFrom, gwTo) {
  const weeks = FDR?.clubs?.[club];
  if (!weeks) return null;
  const from = Math.min(Number(gwFrom), Number(gwTo));
  const to = Math.max(Number(gwFrom), Number(gwTo));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const scores = [];
  for (let gw = from; gw <= to; gw += 1) {
    for (const match of (weeks[gw] || weeks[String(gw)] || [])) {
      const score = scoreOf(match);
      if (score !== null) scores.push(score);
    }
  }
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100;
}
