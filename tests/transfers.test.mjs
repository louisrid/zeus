// THE TRANSFERS PAGE.
//
// Every check here corresponds to something that was actually broken, and each one is written against
// the specific mistake rather than against the shape of the code.
//
// Three separate faults made the old panel answer "Infeasible" to every question:
//   1. the baseline was asked for with the sale list attached, so keeping fifteen while excluding one
//      of them had no legal answer and the failure took every option down with it,
//   2. the change count could be lower than the number marked for sale, which is the same impossibility
//      in a different place,
//   3. the budget was a flat 100.0, which stops being the squad's worth the first night prices move.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transferBudget, changeLevels, STARTING_BUDGET } from "../lib/transfer-budget.mjs";

const client = readFileSync("app/transfers/TransfersClient.jsx", "utf8");
/* The prose in that file explains at length why there is no protect control, so the checks below read
   the code with the comments stripped. Otherwise the explanation trips the very rule it describes. */
const clientCode = client.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const squadPage = readFileSync("app/squad/SquadClient.jsx", "utf8");

const squadOf = (rows) => rows.map(([price, purchasePrice]) => ({ price, purchasePrice }));

test("an untouched squad is worth exactly the starting budget", () => {
  const purse = transferBudget(squadOf(Array.from({ length: 15 }, () => [6, 6]).slice(0, 14).concat([[16, 16]])));
  assert.equal(purse.squadValue, 100);
  assert.equal(purse.bank, 0);
  assert.equal(purse.budget, STARTING_BUDGET);
});

test("a squad whose prices rose is given a budget above 100, not below its own value", () => {
  // This is the fault Louis reported. Two players rise 0.2 each, the fifteen are now worth 100.4, and a
  // 100.0 cap cannot contain them, so holding the squad has no legal answer and every option dies.
  const rows = Array.from({ length: 13 }, () => [6, 6]).concat([[8.2, 8], [14.2, 14]]);
  const purse = transferBudget(squadOf(rows));
  assert.equal(purse.squadValue, 100.4);
  assert.equal(purse.paid, 100);
  assert.equal(purse.bank, 0);
  assert.equal(purse.budget, 100.4);
  assert.ok(purse.budget >= purse.squadValue,
    "the budget must always cover the squad at today's prices, or holding is illegal and nothing can be compared to it");
});

test("money left unspent is added to the budget rather than lost", () => {
  const rows = Array.from({ length: 14 }, () => [6, 6]).concat([[14.5, 14.5]]);
  const purse = transferBudget(squadOf(rows));
  assert.equal(purse.paid, 98.5);
  assert.equal(purse.bank, 1.5);
  assert.equal(purse.budget, 100);
});

test("a squad whose prices fell keeps its bank and loses only the value", () => {
  const rows = Array.from({ length: 14 }, () => [6, 6]).concat([[13.5, 14]]);
  const purse = transferBudget(squadOf(rows));
  assert.equal(purse.squadValue, 97.5);
  assert.equal(purse.bank, 2);
  assert.equal(purse.budget, 99.5);
});

test("the change count never drops below the number marked for sale", () => {
  assert.deepEqual(changeLevels(0), [1, 2, 3]);
  assert.deepEqual(changeLevels(1), [1, 2, 3]);
  assert.deepEqual(changeLevels(2), [2, 3, 4]);
  assert.deepEqual(changeLevels(3), [3, 4, 5]);
  for (const marked of [0, 1, 2, 3, 4, 5]) {
    for (const level of changeLevels(marked)) {
      assert.ok(level >= marked && level >= 1,
        `asking for ${level} changes with ${marked} players excluded has no legal answer`);
    }
  }
});

test("three levels are always offered, so a move that is not a straight swap can be funded", () => {
  assert.equal(changeLevels(1).length, 3);
  assert.equal(changeLevels(2).length, 3);
});

test("the baseline is asked for without the sale list", () => {
  // askSolver(0, []) and nothing else. Passing the exclusions here is what made every option infeasible.
  assert.match(client, /askSolver\(0, \[\]\)/,
    "the hold baseline must carry no exclusions, or keeping the fifteen is impossible by construction");
  assert.ok(!/askSolver\(0, forcedOut\)/.test(client));
});

test("the budget sent to the solver is the squad's worth plus the bank, never a flat hundred", () => {
  assert.match(client, /budget: purse\.budget/);
  assert.ok(!/budget: PLAN_RULES\.budget/.test(client),
    "PLAN_RULES.budget is 100.0, which is what a squad costs on the day it is built and never again");
});

test("the predicted line-up floor is lifted, or a squad you own can be illegal", () => {
  // MONIKA holds a player the predicted line-ups leave out. With the solver's usual 0.55 start-probability
  // floor, holding that squad has no legal answer and the only thing on screen is "Status: Infeasible",
  // which says nothing to anyone. Verified against production: lifting the floor changes no answer for a
  // squad the solver could already hold, and is the sole reason it could not hold the others.
  assert.match(client, /minimum_start_probability: 0/,
    "the transfers page must lift the start-probability floor on every solver call");
});

test("selling is the only selection the page offers", () => {
  // A protect control was explicitly rejected: two states on the same fifteen made every player a
  // question whose answer was almost always the same.
  assert.ok(!/mustKeep|protect|Protect/i.test(clientCode), "there is no protect option and none may be added");
  assert.match(clientCode, /const toggleSell/);
  assert.match(clientCode, /ignores: forcedOut/, "a player marked for sale is excluded so he cannot be bought back");
  assert.ok(!/\bkeep:/.test(clientCode), "nobody is pinned, or the solver cannot sell a second player to free money");
});

test("the planner is gone from the Squad page, not merely hidden", () => {
  for (const trace of ["zeus-planner", "planTransfers", "askSolver", "scoreInPlace",
                       "mustSell", "mustKeep", "planMode", "planFrom", "planTo"]) {
    assert.ok(!squadPage.includes(trace), `app/squad/SquadClient.jsx still contains ${trace}`);
  }
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(!css.includes("zeus-planner"), "the planner CSS is dead weight once the markup is gone");
});

test("the Transfers page is a destination in both navigations", () => {
  const shell = readFileSync("components/Shell.jsx", "utf8");
  const mobile = readFileSync("components/MobileNav.jsx", "utf8");
  const routes = readFileSync("lib/routes.mjs", "utf8");
  assert.match(routes, /key: "transfers"/);
  assert.match(shell, /transfers: ArrowLeftRight/);
  assert.match(mobile, /transfers: ArrowLeftRight/,
    "the phone bar must carry it too; a page reachable only on a desktop is half a page");
});
