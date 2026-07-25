"use client";
/* Squad legality and shape. Every limit is read from the ruleset JSON — nothing here
   hard-codes a squad rule, so launch-day verification (B-15) propagates automatically. */
import rules from "../config/rules-2026-27.json";

export const SQUAD_SIZE = rules.squad.size.value;
export const COMPOSITION = rules.squad.composition.value;          // { GKP:2, DEF:5, MID:5, FWD:3 }
export const BUDGET = rules.squad.budget_millions.value;
export const MAX_PER_CLUB = rules.squad.max_per_club.value;
export const XI_SIZE = rules.squad.starting_xi.value;
export const MINS = rules.squad.formation_minimums.value;          // GKP_exact, DEF_min, MID_min, FWD_min
export const POS_ORDER = ["GKP", "DEF", "MID", "FWD"];

/* All seven legal formations, XI shape only. The evidence score that ranks them comes from the
   strategy study (B-18); until it lands the Builder ranks them by the squad's own projected
   points in each shape, which is honest and needs no external number. */
export const FORMATIONS = [
  { id: "3-4-3", xi: { GKP: 1, DEF: 3, MID: 4, FWD: 3 } },
  { id: "3-5-2", xi: { GKP: 1, DEF: 3, MID: 5, FWD: 2 } },
  { id: "4-3-3", xi: { GKP: 1, DEF: 4, MID: 3, FWD: 3 } },
  { id: "4-4-2", xi: { GKP: 1, DEF: 4, MID: 4, FWD: 2 } },
  { id: "4-5-1", xi: { GKP: 1, DEF: 4, MID: 5, FWD: 1 } },
  { id: "5-3-2", xi: { GKP: 1, DEF: 5, MID: 3, FWD: 2 } },
  { id: "5-4-1", xi: { GKP: 1, DEF: 5, MID: 4, FWD: 1 } },
];
export const formationById = (id) => FORMATIONS.find((f) => f.id === id) || FORMATIONS[1];

export const posCount = (squad, pos) => squad.filter((p) => p.position === pos).length;
export const clubCount = (squad, teamId) => squad.filter((p) => p.team_id === teamId).length;
export const squadCost = (squad) => squad.reduce((s, p) => s + Number(p.price || 0), 0);
export const bankOf = (squad) => +(BUDGET - squadCost(squad)).toFixed(1);

/* Why an add is refused, in plain language, or null if it is legal. */
export function addBlocker(squad, p) {
  if (squad.some((x) => x.id === p.id)) return `${p.web_name} is already in the squad.`;
  if (posCount(squad, p.position) >= COMPOSITION[p.position]) {
    return `You already have all ${COMPOSITION[p.position]} ${p.position === "GKP" ? "goalkeepers" : p.position.toLowerCase() + "s"}.`;
  }
  if (clubCount(squad, p.team_id) >= MAX_PER_CLUB) return `Maximum ${MAX_PER_CLUB} players per club — ${p.team} is full.`;
  const over = +(squadCost(squad) + Number(p.price || 0) - BUDGET).toFixed(1);
  if (over > 0) return `That puts you £${over.toFixed(1)}m over the £${BUDGET.toFixed(1)}m budget.`;
  return null;
}

/* Split a squad into XI and bench for a chosen formation.
   Order within a position is the squad's own order, so drag-to-swap is meaningful. */
export function splitSquad(squad, formation) {
  const shape = formationById(formation).xi;
  const xi = [], bench = [];
  for (const pos of POS_ORDER) {
    const ps = squad.filter((p) => p.position === pos);
    xi.push(...ps.slice(0, shape[pos]));
    bench.push(...ps.slice(shape[pos]));
  }
  // bench order: outfield first in the order they sit, keeper last-but-labelled
  const gk = bench.filter((p) => p.position === "GKP");
  const out = bench.filter((p) => p.position !== "GKP");
  return { xi, bench: [...gk, ...out], shape };
}

/* Which formations this squad can actually field, given who is in it. */
export function feasibleFormations(squad) {
  return FORMATIONS.filter((f) => POS_ORDER.every((pos) => posCount(squad, pos) >= f.xi[pos]));
}

/* Real FPL autosub logic: a 0-minute starter is replaced by the first bench outfielder that
   keeps the formation legal; keepers only swap with keepers. Used by bench-order scoring. */
export function autosubPaths(xi, bench) {
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of xi) counts[p.position] += 1;
  const legalAfter = (outPos, inPos) => {
    const c = { ...counts, [outPos]: counts[outPos] - 1 };
    c[inPos] += 1;
    return c.GKP === MINS.GKP_exact && c.DEF >= MINS.DEF_min && c.MID >= MINS.MID_min && c.FWD >= MINS.FWD_min;
  };
  return xi.map((starter) => {
    const pool = starter.position === "GKP"
      ? bench.filter((b) => b.position === "GKP")
      : bench.filter((b) => b.position !== "GKP");
    const replacement = pool.find((b) => legalAfter(starter.position, b.position)) || null;
    return { starter, replacement };
  });
}

export const POS_LABEL = { GKP: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
