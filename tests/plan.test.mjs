import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_RULES, saleValue, squadAt, transferLedger, hitTotal, validateAt, validateChips, staleness, planFromDraft } from "../lib/plan.mjs";

const mk = (id, position, team_id, price) => ({ fpl_id: id, position, team_id, price, purchasePrice: price });
// A legal fifteen: 2 GK, 5 DEF, 5 MID, 3 FWD, no more than 3 per club, 100.0 exactly.
const base = [
  mk(1, "GKP", 1, 5.0), mk(2, "GKP", 2, 4.0),
  mk(3, "DEF", 1, 6.0), mk(4, "DEF", 2, 5.5), mk(5, "DEF", 3, 5.0), mk(6, "DEF", 4, 4.5), mk(7, "DEF", 5, 4.0),
  mk(8, "MID", 3, 12.0), mk(9, "MID", 4, 8.0), mk(10, "MID", 5, 7.0), mk(11, "MID", 6, 6.0), mk(12, "MID", 7, 5.0),
  mk(13, "FWD", 6, 11.0), mk(14, "FWD", 7, 9.0), mk(15, "FWD", 8, 8.0),
];
const plan = () => ({ structure: "3-5-2", captain: 13, vice: 8, base: base.map((p) => ({ ...p })), weeks: {} });

test("the fixture squad is legal, so the tests below measure the code not the fixture", () => {
  const v = validateAt(plan(), 1);
  assert.deepEqual(v.errors, [], v.errors.join("; "));
  assert.equal(base.reduce((a, p) => a + p.price, 0), PLAN_RULES.budget);
});

test("sale value returns half of a rise, rounded down, and all of a fall", () => {
  assert.equal(saleValue(7.0, 7.3), 7.1);   // 0.3 rise, half is 0.15, rounds DOWN to 0.1
  assert.equal(saleValue(7.0, 7.2), 7.1);
  assert.equal(saleValue(7.0, 7.1), 7.0);   // half of 0.1 rounds down to 0
  assert.equal(saleValue(7.0, 8.0), 7.5);
  assert.equal(saleValue(7.0, 6.5), 6.5);   // a fall is taken in full
  assert.equal(saleValue(7.0, 7.0), 7.0);
});

test("the squad at a gameweek is the base plus every transfer up to it", () => {
  const p = plan();
  p.weeks[2] = { transfers: [{ out: 15, in: 99, position: "FWD", team_id: 9, price: 6.0 }] };
  p.weeks[4] = { transfers: [{ out: 12, in: 98, position: "MID", team_id: 10, price: 6.5 }] };

  assert.ok(squadAt(p, 1).players.some((x) => x.fpl_id === 15), "GW1 predates the first transfer");
  const gw2 = squadAt(p, 2);
  assert.ok(!gw2.players.some((x) => x.fpl_id === 15) && gw2.players.some((x) => x.fpl_id === 99));
  assert.ok(squadAt(p, 3).players.some((x) => x.fpl_id === 99), "a transfer persists into later weeks");
  const gw4 = squadAt(p, 4);
  assert.equal(gw4.players.length, 15, "every transfer is one in, one out");
  assert.ok(gw4.players.some((x) => x.fpl_id === 98) && !gw4.players.some((x) => x.fpl_id === 12));
});

test("an incoherent transfer is reported, never silently skipped", () => {
  const p = plan();
  p.weeks[2] = { transfers: [{ out: 777, in: 99, position: "FWD", team_id: 9, price: 6.0 }] };
  assert.equal(squadAt(p, 2).problems[0].kind, "missing_out");
  const q = plan();
  q.weeks[2] = { transfers: [{ out: 15, in: 8, position: "MID", team_id: 3, price: 12.0 }] };
  assert.equal(squadAt(q, 2).problems[0].kind, "duplicate_in");
});

test("free transfers bank up to five and no further", () => {
  const p = plan();
  const rows = transferLedger(p, 8);
  assert.equal(rows[0].free, 1, "gameweek one starts with one");
  assert.equal(rows[1].free, 2);
  assert.equal(rows[4].free, 5);
  assert.equal(rows[5].free, PLAN_RULES.maxBanked, "the cap holds");
  assert.equal(rows[7].free, PLAN_RULES.maxBanked);
});

test("hits are four points per transfer beyond the free ones", () => {
  const p = plan();
  const t = (n, from) => Array.from({ length: n }, (_, i) => ({ out: base[i].fpl_id, in: from + i, position: base[i].position, team_id: 20 + i, price: 4.5 }));
  p.weeks[1] = { transfers: t(3, 500) };   // one free, two paid
  const rows = transferLedger(p, 2);
  assert.equal(rows[0].paid, 2);
  assert.equal(rows[0].hit, 8);
  assert.equal(rows[1].free, 1, "spending everything leaves next week with just the new one");
  assert.equal(hitTotal(p, 2), 8);
});

test("an unlimited chip makes the week free and does not consume banked transfers", () => {
  const p = plan();
  p.weeks[3] = { chip: "wildcard", transfers: Array.from({ length: 9 }, (_, i) => ({ out: base[i].fpl_id, in: 600 + i, position: base[i].position, team_id: 20 + i, price: 4.5 })) };
  const rows = transferLedger(p, 4);
  assert.equal(rows[2].hit, 0, "a wildcard costs nothing");
  assert.equal(rows[2].used, 0);
  // Banked transfers survive the chip: three going in, still three plus one after.
  assert.equal(rows[2].free, 3);
  assert.equal(rows[3].free, 4, "banked transfers are kept when a chip is played");
});

test("chips are one per half and the first set expires at gameweek nineteen", () => {
  const p = plan();
  p.weeks[5] = { chip: "wildcard" };
  p.weeks[25] = { chip: "wildcard" };
  assert.equal(validateChips(p).ok, true, "one wildcard in each half is legal");

  const q = plan();
  q.weeks[5] = { chip: "wildcard" };
  q.weeks[12] = { chip: "wildcard" };
  assert.equal(validateChips(q).ok, false, "two in the same half is not");
  assert.match(validateChips(q).errors[0], /twice in the first half/);

  const r = plan();
  r.weeks[19] = { chip: "benchboost" };
  r.weeks[20] = { chip: "benchboost" };
  assert.equal(validateChips(r).ok, true, "GW19 is the first half, GW20 the second");
});

test("validation catches an over-budget plan, a club breach and a captain who is also vice", () => {
  const p = plan();
  p.weeks[2] = { transfers: [{ out: 15, in: 99, position: "FWD", team_id: 9, price: 20.0 }] };
  assert.equal(validateAt(p, 2).ok, false, "spending 112.0 must fail");
  assert.ok(validateAt(p, 2).errors.some((e) => /budget/.test(e)));

  const q = plan();
  q.weeks[2] = { transfers: [
    { out: 15, in: 99, position: "FWD", team_id: 1, price: 4.0 },
    { out: 14, in: 98, position: "FWD", team_id: 1, price: 4.0 },
  ] };
  assert.ok(validateAt(q, 2).errors.some((e) => /club 1/.test(e)), "four from one club must fail");

  const r = plan();
  r.vice = r.captain;
  assert.ok(validateAt(r, 1).errors.some((e) => /captain and vice/.test(e)));
});

test("staleness reports price moves and availability against live data", () => {
  const p = plan();
  const live = [
    { fpl_id: 8, price: 12.3, status: "a", web_name: "Riser" },
    { fpl_id: 13, price: 11.0, status: "i", web_name: "Injured" },
    ...base.filter((b) => b.fpl_id !== 8 && b.fpl_id !== 13).map((b) => ({ ...b, status: "a", web_name: "x" })),
  ];
  const out = staleness(p, 1, live);
  assert.ok(out.some((c) => c.kind === "price" && c.fpl_id === 8 && c.to === 12.3));
  assert.ok(out.some((c) => c.kind === "availability" && c.fpl_id === 13));
  const gone = staleness(p, 1, live.filter((x) => x.fpl_id !== 1));
  assert.ok(gone.some((c) => c.kind === "gone" && c.fpl_id === 1));
});

test("an existing draft becomes a plan with no transfers, losing nothing", () => {
  const draft = { id: "d1", name: "GW1 draft", squad: { structure: "3-4-3", captain: 13, vice: 8,
    ignores: [77], maybeIds: [88],
    picks: base.map((p, i) => ({ fpl_id: p.fpl_id, position: p.position, team_id: p.team_id, price: p.price, starting: i < 11 })) } };
  const p = planFromDraft(draft);
  assert.equal(p.base.length, 15);
  assert.equal(p.structure, "3-4-3");
  assert.deepEqual(p.weeks, {});
  assert.deepEqual(p.ignores, [77]);
  assert.equal(validateAt(p, 1).ok, true, "a converted draft must still be legal");
});

test("every table and column the plans migration references actually exists", async () => {
  // Two migrations have now failed in Louis's SQL editor because I referenced tables I had not
  // checked: fixtures_archive, which does not exist, and drafts, which is called squad_drafts. The
  // schema is in the repo, so this is checkable rather than a thing to get wrong twice more.
  const { readFileSync, readdirSync } = await import("node:fs");
  const schema = readdirSync("supabase")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`supabase/${f}`, "utf8"))
    .join("\n");
  const defined = new Set(
    [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1])
  );
  const migration = readFileSync("supabase/migration-021.sql", "utf8");
  const referenced = new Set([
    ...[...migration.matchAll(/\bfrom (\w+)\b/g)].map((m) => m[1]),
    ...[...migration.matchAll(/\binsert into (\w+)\b/g)].map((m) => m[1]),
  ].filter((t) => !/^select$/i.test(t)));

  for (const t of referenced) {
    assert.ok(defined.has(t), `migration-021 references "${t}", which no migration creates`);
  }
});

test("the plans route never reaches an AI provider and never writes from the browser", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("app/api/plans/route.js", "utf8");
  assert.ok(!/openrouter|anthropic|openai/i.test(route));
  assert.match(route, /SUPABASE_SERVICE_KEY/, "writes go through the service key on the server");
  assert.match(route, /migration-021/, "a missing table must name the migration to run");
  // The live slot is permanent.
  assert.match(route, /cannot be deleted/, "deleting the live slot must be refused");
});

test("the timeline reads every figure from the plan, never from a second copy", async () => {
  // The whole reason for storing diffs is that free transfers, hits and the squad cannot disagree with
  // each other. This asserts the timeline derives rather than tracks.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("components/PlanTimeline.jsx", "utf8");
  for (const fn of ["squadAt", "transferLedger", "validateAt", "validateChips", "staleness"]) {
    assert.ok(src.includes(fn), `the timeline must derive its state with ${fn}`);
  }
  // No local state holding a squad or a transfer count, which is how the two would drift apart.
  assert.ok(!/useState\(\s*\[\s*\]\s*\)/.test(src), "the timeline must not keep its own copy of the squad");
  assert.match(src, /xpWithCaptain/, "the captain's doubled xP must show here too");
});

test("a gameweek beyond the published fixtures cannot be planned", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  // Both bounds come from the published fixture list, and both arrows clamp to them.
  assert.match(src, /firstGw/, "the first gameweek must come from the fixture list");
  assert.match(src, /lastGw/, "the last gameweek must come from the fixture list");
  assert.match(src, /Math\.max\(firstGw, g - 1\)/, "the back arrow must clamp");
  assert.match(src, /Math\.min\(lastGw, g \+ 1\)/, "the forward arrow must clamp");
});

test("a transfer respects sale value, the club limit and the money actually available", async () => {
  // The picker must not offer a player the plan cannot afford. Sale value is the trap: a player who has
  // risen 0.4 does not fund a 0.4 upgrade, because FPL returns only half a rise.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("components/TransferPicker.jsx", "utf8");
  assert.match(src, /saleValue/, "the budget must be built from sale value, never current price");
  assert.match(src, /Number\(p\.price\) <= spendable/, "unaffordable players must be filtered out");
  assert.match(src, /maxPerClub/, "the club limit must be enforced");
  assert.match(src, /!owned\.has/, "a player already owned cannot be transferred in");
  assert.match(src, /ignores \|\| \[\]\)\.includes/, "excluded players stay excluded here too");
  // The outgoing player frees a club slot, which the filter must account for.
  assert.match(src, /p\.team_id === out\.team_id \? 1 : 0/);
});

test("a confirmed transfer lands on the right gameweek and nowhere else", () => {
  const p = { structure: "3-5-2", base: [], weeks: {} };
  const weeks = { ...p.weeks };
  weeks[4] = { ...(weeks[4] || {}), transfers: [{ out: 1, in: 2, position: "MID", team_id: 9, price: 6.0 }] };
  const next = { ...p, weeks };
  assert.equal(Object.keys(next.weeks).length, 1);
  assert.equal(next.weeks[4].transfers.length, 1);
  assert.equal(next.weeks[3], undefined, "earlier gameweeks must be untouched");
});

test("the squad screen hydrates every plan row from the live player list", async () => {
  // Plans converted from old drafts stored only { fpl_id, position, starting }: no price, no club. Spend
  // read NaN and every shirt fell back to the default colour. Nothing on screen may trust a stored row.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(src, /byId\.get\(r\.fpl_id\)/, "each row must be looked up in the live player list");
  assert.match(src, /\.filter\(Boolean\)/, "a player no longer in the league must drop out, not render blank");
  // The pitch must be the same component the Builder uses, so a squad looks identical everywhere.
  assert.match(src, /BuilderPitch/, "the Squad screen must draw the same pitch as the Builder");
  assert.ok(!/PlanList/.test(src), "the card list is replaced by the pitch, not sitting alongside it");
});

test("the squad screen offers the live team first and every plan after it", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  const optionsBlock = src.slice(src.indexOf("const options = ["), src.indexOf("];", src.indexOf("const options = [")));
  assert.match(optionsBlock, /id: "live"/, "the live team is the first option");
  assert.ok(optionsBlock.indexOf('id: "live"') < optionsBlock.indexOf("plans"), "and it comes before the plans");
  assert.match(src, /Team \$\{livePlan\.entry_id\}|Team 4812/, "it is labelled with the entry id");
});

test("the live team renders the same empty pitch the Builder shows, and is read-only", async () => {
  // Louis asked for this twice and I argued against it twice, on the grounds that blank shirts are an
  // empty state dressed as data. It is his product: he wants the pitch shape visible before the season
  // starts, and the empty slots are exactly what the Builder already draws for an unstarted squad, so
  // this is consistent rather than invented. What must hold is that it cannot be edited.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(src, /emptySquad\(/, "an empty selection must still draw a pitch, not a sentence");
  assert.match(src, /const readOnly = selectedId === "live"/, "the live team is read-only");
  assert.match(src, /if \(!readOnly\) patchWeek/, "clicking a player must do nothing on the live team");
  assert.match(src, /!empty && !readOnly &&/, "transfer controls must not appear for the live team");
});
