/* THE MONEY A TRANSFER ACTUALLY HAS.
 *
 * The old planner asked the solver to rebuild the squad under a flat 100.0 cap. That is what a squad
 * costs on the day it is built and never again: prices move every night, so a fifteen bought for 100.0
 * is worth 100.4 a fortnight later. Asking the solver to reproduce a 100.4 squad inside a 100.0 cap has
 * no legal answer at all, which is why every option came back as infeasible.
 *
 * The cap the solver needs is what the fifteen are worth at today's prices plus whatever is sitting in
 * the bank, because that is the money genuinely available. Holding the current squad is then always a
 * legal answer, and holding is the baseline every option is measured against.
 *
 * The bank is the starting 100.0 less what was paid for the fifteen. Purchase price is written against
 * every squad member the moment he is bought, so this is read rather than guessed, and it is the same
 * accounting lib/plan.mjs uses when it validates a squad. The two cannot disagree.
 */
export const STARTING_BUDGET = 100.0;

const round1 = (amount) => Math.round(amount * 10) / 10;
const money = (amount) => (Number.isFinite(Number(amount)) ? Number(amount) : 0);

export function transferBudget(players, startingBudget = STARTING_BUDGET) {
  const rows = Array.isArray(players) ? players : [];
  const squadValue = round1(rows.reduce((total, player) => total + money(player.price), 0));
  const paid = round1(rows.reduce((total, player) => total + money(player.purchasePrice ?? player.price), 0));
  const bank = round1(Math.max(0, money(startingBudget) - paid));
  return { squadValue, paid, bank, budget: round1(squadValue + bank) };
}

/* HOW MANY CHANGES TO ASK FOR.
 *
 * A player marked for sale is passed to the solver as an exclusion, so he cannot come back. That means
 * the change count can never be lower than the number marked, and asking for fewer is the second way
 * this screen used to produce an infeasible answer.
 *
 * Above that floor, two more levels are offered. They exist for the transfer that is not a straight
 * swap: when the player you want costs more than the one you are selling, a second or third move exists
 * only to free the money, and the solver funds it by picking a whole fifteen rather than pairing players
 * off one at a time.
 */
export function changeLevels(forcedOutCount, squadSize = 15, extraLevels = 2) {
  const floor = Math.max(1, Number(forcedOutCount) || 0);
  const levels = [];
  for (let step = 0; step <= extraLevels; step += 1) {
    const level = floor + step;
    if (level <= squadSize) levels.push(level);
  }
  return levels;
}
