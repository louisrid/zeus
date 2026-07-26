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

  /* ONE BASIS, CHOSEN BY COVERAGE.
   *
   * Comparing clubs on different formulas is wrong: blending strength and xG for some and using
   * strength alone for others put a mid-table side at the bottom of the league. But requiring perfect
   * coverage was worse, because when neither field covers every club the whole scale returned null and
   * every fixture lost its colour.
   *
   * So: pick the field that covers the most clubs, use it for everyone, and mark the clubs it does not
   * cover as unknown rather than guessing them. Honest gaps beat a silent inconsistency. */
  const coverage = (get) => live.filter((t) => {
    const v = get(t);
    return v !== null && v !== undefined && !Number.isNaN(Number(v));
  }).length;

  const strengthCover = coverage((t) => t.strength);
  const xgCover = coverage((t) => t.xg_for);
  const useXg = xgCover > strengthCover;
  const basisName = useXg ? "attacking xG" : "club strength";
  const get = useXg ? ((t) => t.xg_for) : ((t) => t.strength);
  const basisRange = range(get);
  const covered = Math.max(strengthCover, xgCover);
  const strengthRange = basisRange;
  const xgRange = null;
  const xgUsable = useXg;
  const clubsWithXg = xgCover;
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
      // One field for every club, chosen by coverage above.
      const v = norm(get(opp), basisRange);
      if (v === null) return null;   // this club is genuinely unknown; the tag shows no colour
      threat = v;
      basis = basisName;
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

  const ready = basisRange !== null || impliedRange !== null;
  return { difficultyOf, runDifficulty, ready, hasOdds: impliedRange !== null,
    basis: basisName, covered, clubs: live.length, xgUsable, clubsWithXg };
}
