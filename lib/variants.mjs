/* GW1 DRAFT VARIANTS — B-16.
 *
 * Three squads, three opening postures, built from the same pool so they are genuinely comparable.
 * The point is not that one is right. It is that you see what each posture costs and buys before
 * committing, which is the decision the whole tool exists to support.
 *
 *   TEMPLATE      maximise what the field owns. Protects rank, makes overtaking the field hard.
 *   BALANCED      the template core plus a few of your own.
 *   DIFFERENTIAL  deliberately unlike the field. The only route to large rank gain, and to large loss.
 *
 * Each variant maximises the same thing, score, but with an ownership term weighted differently:
 *
 *   objective(player) = score + w x (scoreSpread / ownershipSpread) x ownership
 *
 * The normalisation makes w mean something concrete: w = 1 says "willing to trade the entire spread
 * of projected score across the entire spread of ownership". w > 0 pulls toward the template, w < 0
 * pushes away from it, w = 0 ignores the field entirely. Without that normalisation the weight is
 * arbitrary and, at small values, changes no picks at all, which makes the three postures identical.
 * Nothing here invents a target level of alignment: the three weights are labels for three postures,
 * and the resulting alignment is reported rather than aimed at, because what alignment actually wins
 * needs manager pick data that arrives with the season.
 *
 * Pure: no database. The caller supplies the pool, the scorer and the squad builder.
 */

export const POSTURES = [
  { key: "template", name: "Template", weight: 1.0,
    why: "Owns what the field owns. Rank is protected on a bad week and hard to gain on a good one." },
  { key: "balanced", name: "Balanced", weight: 0.0,
    why: "Picks purely on projected score, ignoring what anyone else owns." },
  { key: "differential", name: "Differential", weight: -1.0,
    why: "Deliberately unlike the field. Large rank swings in both directions." },
];

/* Build the three variants.
 *
 *   pool         available players, each with price, position, own, fpl_id
 *   scoreOf      (player) => number
 *   buildSquad   (scoreFn) => squad   the existing solver, given a scoring function
 *   evaluate     (squad) => object    the existing evaluator, for the comparison figures
 */
export function buildVariants({ pool, scoreOf, buildSquad, evaluate }) {
  if (!pool || !pool.length || !scoreOf || !buildSquad) return [];

  // Ownership is a percentage; scores are points. Normalise so one weight means the same thing to
  // every posture regardless of the scale either happens to be on.
  const scores = pool.map(scoreOf).filter((v) => Number.isFinite(v));
  const owns = pool.map((p) => Number(p.own) || 0);
  const scoreSpread = Math.max(...scores) - Math.min(...scores) || 1;
  const ownSpread = Math.max(...owns) - Math.min(...owns) || 1;
  const ratio = scoreSpread / ownSpread;

  return POSTURES.map((posture) => {
    const objective = (p) => scoreOf(p) + posture.weight * ratio * (Number(p.own) || 0);
    const squad = buildSquad(objective);
    const readout = evaluate ? evaluate(squad) : null;
    const players = squad && squad.players ? squad.players : [];
    const meanOwn = players.length ? players.reduce((a, p) => a + (Number(p.own) || 0), 0) / players.length : null;
    return {
      ...posture,
      squad,
      readout,
      // Reported, not targeted.
      meanOwnership: meanOwn === null ? null : Math.round(meanOwn * 10) / 10,
      spend: players.length ? Math.round(players.reduce((a, p) => a + (Number(p.price) || 0), 0) * 10) / 10 : null,
      score: players.length ? Math.round(players.reduce((a, p) => a + scoreOf(p), 0) * 10) / 10 : null,
    };
  });
}

/* What differs between the variants. A comparison is only useful if it says where they diverge. */
export function variantDifferences(variants) {
  const sets = variants.map((v) => new Set((v.squad && v.squad.players ? v.squad.players : []).map((p) => p.fpl_id)));
  const everyone = new Set(sets.flatMap((s) => [...s]));
  const shared = [...everyone].filter((id) => sets.every((s) => s.has(id)));
  return variants.map((v, i) => ({
    key: v.key,
    unique: (v.squad && v.squad.players ? v.squad.players : []).filter((p) => !sets.some((s, j) => j !== i && s.has(p.fpl_id))),
    sharedCount: shared.length,
  }));
}
