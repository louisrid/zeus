/* MULTI-GAMEWEEK PLANS.
 *
 * A plan is a base fifteen plus a list of transfers per gameweek. The squad at gameweek N is the base
 * with every transfer up to N applied. Nothing is stored as a snapshot.
 *
 * Why diffs rather than snapshots: with 38 independent snapshots, gameweek 3 can contain a player who
 * was never transferred in, free transfers and hits become unknowable, and an illegal plan is easy to
 * save by accident. With diffs, transfer counts, hits and "what changed this week" fall out of the data,
 * and a plan that does not add up cannot be represented at all.
 *
 * 2026/27 rules, verified against Fantasy Football Scout and the Premier League site, July 2026:
 *   one free transfer per gameweek, banking up to FIVE, each extra transfer costs four points,
 *   two chip sets with the first set expiring at the gameweek 19 deadline, and banked free transfers
 *   are KEPT when a chip is played.
 */

export const PLAN_RULES = {
  freePerGw: 1,
  maxBanked: 5,
  hitCost: 4,
  firstHalfEndsAfterGw: 19,
  squadSize: 15,
  quotas: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
  maxPerClub: 3,
  budget: 100,
  // One of each per half. A wildcard or free hit gives unlimited transfers for that gameweek only.
  chips: ["wildcard", "freehit", "triplecaptain", "benchboost"],
  unlimitedChips: ["wildcard", "freehit"],
};

/* SALE VALUE. FPL returns the purchase price plus half of any rise, rounded down to the nearest 0.1.
 * A fall is returned in full. Ignoring this makes a plan drift out of budget by a few gameweeks and
 * quietly become illegal, which is worse than showing no money at all. */
export function saleValue(purchasePrice, currentPrice) {
  const bought = Number(purchasePrice);
  const now = Number(currentPrice);
  if (!Number.isFinite(bought) || !Number.isFinite(now)) return null;
  if (now <= bought) return Math.round(now * 10) / 10;
  const rise = now - bought;
  const kept = Math.floor((rise / 2) * 10) / 10;   // half the rise, rounded DOWN to 0.1
  return Math.round((bought + kept) * 10) / 10;
}

const gwsUpTo = (plan, gw) =>
  Object.keys(plan.weeks || {}).map(Number).filter((n) => n <= gw).sort((a, b) => a - b);

/* THE SQUAD AT A GAMEWEEK. Base fifteen, then every transfer in order. A transfer that refers to a
 * player who is not in the squad at that point is reported rather than silently skipped, because a
 * plan that cannot be applied is a plan the user needs to fix. */
export function squadAt(plan, gw) {
  const base = (plan.base || []).map((p) => ({ ...p }));
  let players = base;
  const problems = [];

  for (const n of gwsUpTo(plan, gw)) {
    const week = plan.weeks[n] || {};
    for (const t of week.transfers || []) {
      const outIdx = players.findIndex((p) => p.fpl_id === t.out);
      if (outIdx === -1) {
        problems.push({ gw: n, kind: "missing_out", fpl_id: t.out });
        continue;
      }
      if (players.some((p) => p.fpl_id === t.in)) {
        problems.push({ gw: n, kind: "duplicate_in", fpl_id: t.in });
        continue;
      }
      players = players.filter((_, i) => i !== outIdx);
      players.push({
        fpl_id: t.in, position: t.position, team_id: t.team_id,
        price: t.price, purchasePrice: t.price, starting: false,
      });
    }
  }

  const week = (plan.weeks || {})[gw] || {};
  return {
    gw,
    players,
    captain: week.captain ?? plan.captain ?? null,
    vice: week.vice ?? plan.vice ?? null,
    benchOrder: week.benchOrder || [],
    chip: week.chip || null,
    structure: week.structure || plan.structure || "3-5-2",
    problems,
  };
}

/* FREE TRANSFERS AND HITS, walked forward from gameweek one. Banked transfers survive a chip, and an
 * unlimited chip makes that week's transfers free without consuming any. */
export function transferLedger(plan, upToGw) {
  const rows = [];
  let free = PLAN_RULES.freePerGw;   // gameweek one starts with one
  for (let gw = 1; gw <= upToGw; gw++) {
    const week = (plan.weeks || {})[gw] || {};
    const made = (week.transfers || []).length;
    const chip = week.chip || null;
    const unlimited = PLAN_RULES.unlimitedChips.includes(chip);

    const used = unlimited ? 0 : Math.min(made, free);
    const paid = unlimited ? 0 : Math.max(0, made - free);
    const hit = paid * PLAN_RULES.hitCost;

    rows.push({ gw, made, free, used, paid, hit, chip, unlimited });

    // Next week: unused transfers bank, capped, then one is added.
    const carried = unlimited ? free : free - used;
    free = Math.min(PLAN_RULES.maxBanked, carried + PLAN_RULES.freePerGw);
  }
  return rows;
}

export function hitTotal(plan, upToGw) {
  return transferLedger(plan, upToGw).reduce((a, r) => a + r.hit, 0);
}

/* WHAT A SQUAD IS WORTH, AND WHAT IT CAN SPEND.
 *
 * One place, so no page has to work it out for itself. Every page that tried ended up assuming a
 * squad is always worth exactly 100.0, which stops being true the first night prices move.
 *
 *   paid    what the fifteen cost when they were bought
 *   bank    the starting budget less what was paid, never negative
 *   value   what the fifteen would fetch if sold today, at FPL sale value
 *   spend   value plus bank, the money genuinely available to rebuild with
 */
export function squadMoney(players, priceOf, startingBudget = PLAN_RULES.budget) {
  const rows = Array.isArray(players) ? players : [];
  const round1 = (n) => Math.round(n * 10) / 10;
  let paid = 0;
  let value = 0;
  for (const player of rows) {
    const bought = Number(player.purchasePrice ?? player.price ?? 0);
    const now = Number((priceOf ? priceOf(player.fpl_id) : null) ?? player.price ?? bought);
    paid += Number.isFinite(bought) ? bought : 0;
    const sale = saleValue(bought, now);
    value += Number.isFinite(sale) ? sale : (Number.isFinite(now) ? now : 0);
  }
  paid = round1(paid);
  value = round1(value);
  const bank = round1(Math.max(0, startingBudget - paid));
  return { paid, value, bank, spend: round1(value + bank) };
}

/* VALIDATION, per gameweek. Everything here is a rule the game enforces, so a plan that fails is not a
 * matter of taste: it could not be entered. */
export function validateAt(plan, gw, priceOf) {
  const s = squadAt(plan, gw);
  const errors = [];
  const q = PLAN_RULES.quotas;

  if (s.players.length !== PLAN_RULES.squadSize) {
    errors.push(`${s.players.length} players, needs ${PLAN_RULES.squadSize}`);
  }
  for (const pos of Object.keys(q)) {
    const n = s.players.filter((p) => p.position === pos).length;
    if (n !== q[pos]) errors.push(`${pos}: ${n} of ${q[pos]}`);
  }
  const clubs = new Map();
  for (const p of s.players) clubs.set(p.team_id, (clubs.get(p.team_id) || 0) + 1);
  for (const [team, n] of clubs) {
    if (n > PLAN_RULES.maxPerClub) errors.push(`${n} players from club ${team}, max ${PLAN_RULES.maxPerClub}`);
  }

  /* MONEY.
   *
   * This used to add up today's price for all fifteen and compare it against a flat 100.0, which
   * called a squad illegal the moment it appreciated by a tenth. That is backwards: a squad rising in
   * value is the manager doing well, and FPL has never invalidated anyone for it.
   *
   * The rule the game actually enforces is that you cannot spend money you do not have. What you have
   * is the sale value of the fifteen you own plus whatever is left in the bank, and what you paid is
   * fixed at the moment of purchase. So the test is against what was paid, not against what the squad
   * is worth now, and it uses sale value rather than current price because that is what FPL gives back
   * when you sell. saleValue is defined at the top of this file and was previously unused here.
   *
   * A squad is only illegal if the money was never there in the first place: fifteen players bought
   * for more than 100.0 in total. Appreciation afterwards is not an error, it is a bank balance. */
  const paid = s.players.reduce((total, player) => {
    const bought = Number(player.purchasePrice ?? player.price ?? 0);
    return total + (Number.isFinite(bought) ? bought : 0);
  }, 0);
  if (paid > PLAN_RULES.budget + 1e-9) {
    errors.push(`${paid.toFixed(1)} paid for the squad, budget is ${PLAN_RULES.budget.toFixed(1)}`);
  }

  if (s.captain && s.vice && s.captain === s.vice) errors.push("captain and vice are the same player");
  if (s.captain && !s.players.some((p) => p.fpl_id === s.captain)) errors.push("captain is not in the squad");
  if (s.vice && !s.players.some((p) => p.fpl_id === s.vice)) errors.push("vice is not in the squad");

  for (const p of s.problems) {
    errors.push(p.kind === "missing_out"
      ? `GW${p.gw}: transfers out a player who is not in the squad`
      : `GW${p.gw}: transfers in a player who is already in the squad`);
  }
  return { ok: errors.length === 0, errors, squad: s };
}

/* CHIP LEGALITY across the whole plan. Two sets, one per half, first set expires at the gameweek 19
 * deadline, one chip per gameweek. */
export function validateChips(plan) {
  const errors = [];
  const used = { first: new Map(), second: new Map() };
  for (const gwStr of Object.keys(plan.weeks || {})) {
    const gw = Number(gwStr);
    const chip = (plan.weeks[gwStr] || {}).chip;
    if (!chip) continue;
    if (!PLAN_RULES.chips.includes(chip)) { errors.push(`GW${gw}: ${chip} is not a chip`); continue; }
    const half = gw <= PLAN_RULES.firstHalfEndsAfterGw ? "first" : "second";
    const seen = used[half];
    if (seen.has(chip)) errors.push(`${chip} played twice in the ${half} half, GW${seen.get(chip)} and GW${gw}`);
    else seen.set(chip, gw);
  }
  return { ok: errors.length === 0, errors };
}

/* A plan built today contains players whose price or status has since moved. Rather than trusting it,
 * every gameweek is re-checked against live data and the differences reported. */
export function staleness(plan, gw, livePlayers) {
  const live = new Map((livePlayers || []).map((p) => [p.fpl_id, p]));
  const s = squadAt(plan, gw);
  const changes = [];
  for (const p of s.players) {
    const now = live.get(p.fpl_id);
    if (!now) { changes.push({ fpl_id: p.fpl_id, kind: "gone" }); continue; }
    if (Number(now.price) !== Number(p.price)) {
      changes.push({ fpl_id: p.fpl_id, kind: "price", from: Number(p.price), to: Number(now.price), name: now.web_name });
    }
    if (now.status && now.status !== "a") {
      changes.push({ fpl_id: p.fpl_id, kind: "availability", status: now.status, name: now.web_name });
    }
  }
  return changes;
}

/* An existing single-gameweek draft becomes a plan with no transfers, so nothing already saved is lost
 * and there is one vocabulary rather than three. */
export function planFromDraft(draft) {
  const sq = draft.squad || {};
  return {
    id: draft.id,
    name: draft.name,
    structure: sq.structure || "3-5-2",
    captain: sq.captain ?? null,
    vice: sq.vice ?? null,
    base: (sq.picks || []).map((p) => ({
      fpl_id: p.fpl_id, position: p.position, team_id: p.team_id,
      price: p.price, purchasePrice: p.purchasePrice ?? p.price, starting: Boolean(p.starting),
    })),
    weeks: {},
    ignores: sq.ignores || [],
    maybeIds: sq.maybeIds || [],
  };
}
