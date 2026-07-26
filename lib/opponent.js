/* Dynamic opponent strength (FPLBot's own, replacing FPL's five-step FDR).
 *
 * FORMULA — stated here and in docs so nothing is a black box.
 *
 *   threat(opponent) = 0.60 · norm(strength) + 0.40 · norm(xg_for)      [xg_for present]
 *                    = norm(strength)                                   [xg_for missing]
 *
 *   norm(v) is min-max across the twenty current clubs only, so the scale re-centres
 *   automatically as the season moves and never depends on hard-coded club tiers.
 *
 *   venue: facing a club at its own ground adds 0.08; facing it away subtracts 0.08.
 *
 *   difficulty = clamp(0..100) of (threat + venue) · 100
 *
 * Five bands are cut on the difficulty value, not on club identity, so the scale is
 * continuous underneath and more granular than FDR's fixed 1-5.
 *
 * When the odds pipeline lands, pass impliedGoals for the opponent and it takes precedence
 * over strength and xg_for entirely: difficulty then reads off the market rather than form.
 */

const GREEN = "#00FF85";
const PALE_GREEN = "#8CFFC4";
const WHITE = "#FFFFFF";
const PALE_PINK = "#FF7FA5";
const PINK = "#E90052";

export const OPP_BANDS = [
  { max: 20, band: 1, tone: GREEN, label: "VERY EASY" },
  { max: 40, band: 2, tone: PALE_GREEN, label: "EASY" },
  { max: 60, band: 3, tone: WHITE, label: "AVERAGE" },
  { max: 80, band: 4, tone: PALE_PINK, label: "HARD" },
  { max: 101, band: 5, tone: PINK, label: "VERY HARD" },
];

export const bandOfDifficulty = (d) => OPP_BANDS.find((b) => d < b.max) || OPP_BANDS[OPP_BANDS.length - 1];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Build once per page from teamById. Returns a scale object used by every surface, so the
   colours and numbers are identical everywhere by construction rather than by convention. */
export function buildOpponentScale(teamById, impliedGoalsByTeamId) {
  const live = Object.values(teamById || {}).filter((t) => t && t.archive !== true);

  const range = (get) => {
    const vals = live.map(get).filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return hi > lo ? { lo, hi } : null;
  };

  const strengthRange = range((t) => t.strength);
  // xG is only usable if EVERY live club has it. Blending strength+xG for some clubs and strength
  // alone for others puts them on different scales, which is how a mid-table side ended up reading
  // as the easiest fixture in the league.
  const clubsWithXg = live.filter((t) => t.xg_for !== null && t.xg_for !== undefined && !Number.isNaN(Number(t.xg_for))).length;
  const xgUsable = live.length > 0 && clubsWithXg === live.length;
  const xgRange = xgUsable ? range((t) => t.xg_for) : null;
  const impliedRange = impliedGoalsByTeamId
    ? range((t) => impliedGoalsByTeamId[t.id])
    : null;

  const norm = (v, r) => (r === null || v === null || v === undefined || Number.isNaN(Number(v)) ? null : clamp((Number(v) - r.lo) / (r.hi - r.lo), 0, 1));

  function difficultyOf(oppTeamId, playerIsHome) {
    const opp = teamById ? teamById[oppTeamId] : null;
    if (!opp) return null;

    // Market first when it exists.
    const implied = impliedGoalsByTeamId ? norm(impliedGoalsByTeamId[oppTeamId], impliedRange) : null;
    let threat = implied;
    let basis = "odds";

    if (threat === null) {
      const s = norm(opp.strength, strengthRange);
      const x = xgUsable ? norm(opp.xg_for, xgRange) : null;
      if (s === null && x === null) return null;
      // One basis for every club, or the numbers are not comparable.
      if (s !== null && x !== null) { threat = 0.6 * s + 0.4 * x; basis = "strength + xG"; }
      else if (s !== null) { threat = s; basis = "strength only, xG incomplete"; }
      else { threat = x; basis = "xG"; }
    }

    const venue = playerIsHome ? -0.08 : 0.08;
    const difficulty = Math.round(clamp((threat + venue) * 100, 0, 100));
    return { difficulty, basis, ...bandOfDifficulty(difficulty) };
  }

  /* Difficulty of a run of fixtures: the mean, so a six-week look-ahead is one number. */
  function runDifficulty(fxList) {
    const vals = (fxList || []).map((f) => difficultyOf(f.oppId, f.home)).filter(Boolean).map((d) => d.difficulty);
    if (!vals.length) return null;
    const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { difficulty: mean, count: vals.length, ...bandOfDifficulty(mean) };
  }

  const ready = strengthRange !== null || xgRange !== null || impliedRange !== null;
  return { difficultyOf, runDifficulty, ready, hasOdds: impliedRange !== null, xgUsable, clubsWithXg, clubs: live.length };
}
