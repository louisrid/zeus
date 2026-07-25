/* SQUAD SCORING — DECISIONS 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.11.
 *
 * Every formula is stated here and repeated in docs/scoring-formulas.md. Nothing in this file is
 * hand-picked and nothing returns a number when the inputs for it do not exist: a score that
 * cannot be computed returns null, and the panel renders nothing for it.
 *
 * All scores are 0 to 100 and mean the same thing everywhere: how close this squad is to the best
 * that could be assembled from the current pool. 100 is the ceiling of what is available, not a
 * theoretical maximum, so the number moves as the market moves.
 */

const POSITIONS = ["GKP", "DEF", "MID", "FWD"];
const STARTERS_NEEDED = { GKP: 1, DEF: 3, MID: 2, FWD: 1 }; // minimums; actual comes from the shape

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* LINE STRENGTH — DECISIONS 7.2
 *
 *   lineStrength(pos) = 100 · mean(score of this squad's starters in pos)
 *                             ÷ mean(score of the top N scorers at pos in the whole pool)
 *
 * where N is how many starters the current shape uses at that position. It answers "how close is
 * this line to the best line I could have picked", which is the question a weak line raises.
 * Returns null when the line has no starters yet, rather than zero.
 */
export function lineStrength(squad, pool, scoreOf) {
  const out = {};
  for (const pos of POSITIONS) {
    const starters = squad.players.filter((p) => p.position === pos && p.starting);
    if (!starters.length) { out[pos] = null; continue; }
    const n = starters.length;
    const best = pool
      .filter((p) => p.position === pos)
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, n);
    const mine = mean(starters.map(scoreOf));
    const ceiling = mean(best.map(scoreOf));
    out[pos] = ceiling && ceiling > 0 ? Math.round(clamp((mine / ceiling) * 100, 0, 100)) : null;
  }
  return out;
}

/* OVERALL SQUAD SCORE — DECISIONS 7.1
 *
 *   overall = Σ (lineStrength(pos) · starters(pos)) ÷ Σ starters(pos)
 *
 * A starter-weighted mean of the line strengths, so five midfielders count more than one keeper.
 * Bench is excluded deliberately: bench quality is reported separately as the bench floor, and
 * folding it in here would hide a weak eleven behind a strong bench.
 * Returns null until at least one line can be scored.
 */
export function overallScore(lines, squad) {
  let num = 0, den = 0;
  for (const pos of POSITIONS) {
    if (lines[pos] === null) continue;
    const n = squad.players.filter((p) => p.position === pos && p.starting).length;
    num += lines[pos] * n;
    den += n;
  }
  return den === 0 ? null : Math.round(num / den);
}

/* CAPTAINCY STRENGTH — DECISIONS 7.4
 *
 *   captaincyStrength = 100 · (best armband expected value in this squad)
 *                             ÷ (best armband expected value available in the pool)
 *
 * The armband doubles one player, so the question is not "is my captain good" but "how much am I
 * giving up against the best captain I could own". Returns null when there is no eleven yet.
 */
export function captaincyStrength(bestInSquadEv, pool, scoreOf) {
  if (bestInSquadEv === null || bestInSquadEv === undefined) return null;
  const bestAvailable = pool.reduce((m, p) => Math.max(m, scoreOf(p)), 0);
  if (!bestAvailable) return null;
  return Math.round(clamp((bestInSquadEv / bestAvailable) * 100, 0, 100));
}

/* TEMPLATE ALIGNMENT — DECISIONS 7.5, 7.6, 7.7
 *
 *   alignment = 100 · |my fifteen ∩ template fifteen| ÷ 15
 *
 * The template fifteen is the most-owned legal fifteen, computed from live ownership.
 *
 * THIS IS NOT HIGHER-IS-BETTER. Alignment of 100 means the squad cannot out-score the field and
 * rank 1 is arithmetically impossible. Alignment of 0 is pure variance. The useful number sits
 * between, and both sides are returned so the trade-off is visible:
 *   missing  — template players not owned, each a way to fall behind
 *   unique   — players owned that the template does not have, each a way to gain
 *
 * NO TARGET ZONE IS RETURNED. The zone would have to come from what actually won in past seasons,
 * which requires manager pick data that is not in any source currently ingested. Inventing a band
 * would be exactly the kind of non-discriminating metric that EXCLUSIONS 12.9 forbids. The band
 * arrives with the strategy study, and `zoneFitted: false` says so until then.
 *
 * The top-10k template is a separate, unavailable input: it needs the rival scraper (ticket B-17).
 */
export function templateAlignment(squad, templateFifteen) {
  if (!templateFifteen || !templateFifteen.length) return null;
  const mine = new Set(squad.players.map((p) => p.fpl_id));
  const theirs = templateFifteen.map((p) => p.fpl_id);
  const shared = theirs.filter((id) => mine.has(id));
  const missing = templateFifteen.filter((p) => !mine.has(p.fpl_id));
  const templateIds = new Set(theirs);
  const unique = squad.players.filter((p) => !templateIds.has(p.fpl_id));
  return {
    pct: Math.round((shared.length / templateFifteen.length) * 100),
    shared: shared.length,
    of: templateFifteen.length,
    missing,
    unique,
    zoneFitted: false,
    zoneSource: "Target band arrives with the strategy study on 3 Aug. Top-10k template needs the rival scraper.",
  };
}

/* CLUB CONCENTRATION — DECISIONS 7.9
 *
 *   clubs = distinct clubs across the fifteen
 *   max   = largest block from one club (three is the rule ceiling)
 */
export function clubConcentration(squad) {
  const byClub = {};
  for (const p of squad.players) byClub[p.team] = (byClub[p.team] || 0) + 1;
  const counts = Object.values(byClub);
  return { clubs: counts.length, max: counts.length ? Math.max(...counts) : 0 };
}

/* One call for the panel. Anything that cannot be computed is null and renders as nothing. */
export function scoreSquad({ squad, pool, scoreOf, bestCaptainEv, templateFifteen }) {
  const lines = lineStrength(squad, pool, scoreOf);
  return {
    lines,
    overall: overallScore(lines, squad),
    captaincy: captaincyStrength(bestCaptainEv, pool, scoreOf),
    template: templateAlignment(squad, templateFifteen),
    clubs: clubConcentration(squad),
  };
}

export const SCORE_BANDS = [
  { min: 90, tone: "green", label: "Near the ceiling" },
  { min: 75, tone: "white", label: "Solid" },
  { min: 0, tone: "pink", label: "Below what is available" },
];
export const bandFor = (v) => (v === null ? null : SCORE_BANDS.find((b) => v >= b.min));
