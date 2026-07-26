/* THE SCHEDULE. The only definition of project dates in the repo.
 *
 * Set by Louis on 26 Jul 2026. Nothing anywhere may hard-code a date string: the UI reads
 * UPGRADES from lib/solver/score.mjs, which reads this. docs/DECISIONS.md section 14 is the
 * binding record, and tests/design-system.test.mjs fails the build if a date literal appears
 * in any surface file.
 *
 * A .js module rather than JSON so both the Next bundler and plain node --test can import it
 * without an import attribute.
 */
const SCHEDULE = {
  mvp: { date: "2026-07-26", label: "26 JUL", note: "Working MVP" },
  complete: { date: "2026-07-28T22:00:00+01:00", label: "28 JUL", note: "Complete project, 22:00" },
  upgrades: { score: "28 JUL", minutes: "28 JUL", structure: "28 JUL" },
};
export default SCHEDULE;
