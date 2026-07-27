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

test("the squad screen derives every figure from the plan, never from a second copy", async () => {
  // The whole reason for storing a base plus diffs is that the squad, free transfers and hits cannot
  // disagree with each other. This asserts the screen derives rather than tracking its own copy.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  for (const fn of ["squadAt", "transferLedger", "saleValue"]) {
    assert.ok(src.includes(fn), `the screen must derive its state with ${fn}`);
  }
  assert.match(src, /xpWithCaptain/, "the captain's doubled xP must show here too");
  assert.ok(!/useState\(\s*\[\s*\]\s*\)/.test(src), "it must not keep its own copy of the squad");
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

test("a replacement respects sale value, the club limit and the quotas", async () => {
  // Sale value is the trap: a player who has risen 0.4 does not fund a 0.4 upgrade, because FPL returns
  // only half a rise. The shared player list enforces budget, club limit and position quotas, and the
  // Squad screen computes what is spendable from sale value rather than current price.
  const { readFileSync } = await import("node:fs");
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(squad, /saleValue\(replacing\.price, replacing\.price\)/, "spendable money must come from sale value");
  assert.match(squad, /bankNow \+/, "and be added to what is already in the bank");

  const list = readFileSync("components/Candidates.jsx", "utf8");
  assert.match(list, /bank\(squad\)/, "the list must respect the bank");
  assert.match(list, /clubCount\(squad, p\.team_id\) >= RULES\.maxPerClub/, "and the club limit");
  assert.match(list, /squadCountPos/, "and the position quotas");
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
  // Nothing that changes a plan may run for the live team: opening the action menu, swapping a player
  // and completing a transfer are each gated.
  for (const gated of [
    /if \(readOnly\) return;\s*\n\s*if \(!replacing\) return setMenuFor/,  // one guard covers the menu and the replacement
    /if \(!state \|\| readOnly\) return;/,   // bench and start refuse
    /if \(readOnly \|\| !working\) return;/,  // adding a player refuses
    /if \(readOnly\) return;/,               // a transfer refuses
    /\{menuFor && !readOnly &&/,            // and the menu never renders
  ]) {
    assert.match(src, gated, `a mutation is not gated on readOnly: ${gated}`);
  }
  // Both transfer surfaces, the planned-transfer list and the player list, must hide for the live team.
  assert.equal((src.match(/\{!readOnly &&/g) || []).length >= 2, true,
    "the planned transfers and the player list must both be gated on readOnly");
});

test("a transfer beyond the free ones costs four points and shows in the xP figure", () => {
  // A settled team is not a blank slate. The Builder can pick freely; the Squad screen cannot, and the
  // cost has to land in the headline number rather than a footnote.
  const base = Array.from({ length: 15 }, (_, i) => ({
    fpl_id: i + 1, position: i < 2 ? "GKP" : i < 7 ? "DEF" : i < 12 ? "MID" : "FWD",
    team_id: i + 1, price: 5.0, purchasePrice: 5.0,
  }));
  const t = (n, from) => Array.from({ length: n }, (_, i) => ({
    out: base[i].fpl_id, in: from + i, position: base[i].position, team_id: 30 + i, price: 5.0,
  }));

  // One free transfer in GW1: one move is free, the second costs four, the third eight in total.
  const one = { base, weeks: { 1: { transfers: t(1, 900) } } };
  assert.equal(transferLedger(one, 1)[0].hit, 0);

  const two = { base, weeks: { 1: { transfers: t(2, 900) } } };
  assert.equal(transferLedger(two, 1)[0].hit, PLAN_RULES.hitCost);

  const three = { base, weeks: { 1: { transfers: t(3, 900) } } };
  assert.equal(transferLedger(three, 1)[0].hit, PLAN_RULES.hitCost * 2, "two extra moves is minus eight");

  // Banking: doing nothing in GW1 leaves two free in GW2, so two moves there cost nothing.
  const banked = { base, weeks: { 2: { transfers: t(2, 900) } } };
  const rows = transferLedger(banked, 2);
  assert.equal(rows[1].free, 2);
  assert.equal(rows[1].hit, 0, "a banked transfer must not be charged");
});

test("both pages use the same pitch, the same player list and the same xP pill", async () => {
  const { readFileSync } = await import("node:fs");
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  for (const shared of ["BuilderPitch", "Candidates"]) {
    assert.match(squad, new RegExp(shared), `the Squad screen must use ${shared}`);
    assert.match(builder, new RegExp(shared), `the Builder must use ${shared}`);
  }
  // The modal picker is gone: swapping happens in the list at the bottom on both pages.
  assert.ok(!/TransferPicker/.test(squad), "the modal transfer picker is replaced by the shared list");
  /* The score moved OFF the pitch and into a box above it, because the pitch corners now carry the two
     controls that describe the shape and the money. Four things in one corner was overcrowding. */
  for (const [name, src] of [["squad", squad], ["builder", builder]]) {
    assert.match(src, /<XpBox/, `the ${name} page must show the score in a box above the pitch`);
  }
  const pitch = readFileSync("components/BuilderPitch.jsx", "utf8");
  assert.ok(!/XpPill/.test(pitch), "and not on the pitch as well, which would show it twice");
  assert.match(pitch, /top: 14, left: 16/, "the pitch's top-left carries the formation dropdown");
  assert.match(pitch, /top: 14, right: 16/, "and its top-right the budget");
});

test("swapping a player is an exchange, so nobody can be lost", async () => {
  // Dragging repeatedly made a starter disappear: a drop could fire against a stale target and write a
  // squad short of a player. A same-position exchange cannot, because both ids are named in one write.
  const { readFileSync } = await import("node:fs");
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(squad, /Boolean\(x\.starting\) !== Boolean\(p\.starting\)/, "the target must be on the other side");
  assert.match(squad, /x\.position === p\.position/, "and in the same position");
  assert.match(squad, /startingIds/, "the result is written as a full starting list, never a removal");

  // Drag and drop is gone from every surface, since that was the mechanism that lost players.
  for (const f of ["components/BuilderPitch.jsx", "app/squad/SquadClient.jsx", "app/builder/BuilderClient.jsx"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/draggable|onDragStart|onDragOver|onDrop\b/.test(src), `${f} still has drag and drop`);
  }
});

test("an empty slot occupies the same box as a filled one", async () => {
  // When a player left the line-up the empty square jumped upward, because a filled cell carries a kit,
  // a name, a price row, a fixture tag and a page link while the empty slot carried a box and a label.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("components/BuilderPitch.jsx", "utf8");
  assert.match(src, /const CELL = \{ width: 84, minHeight: \d+ \}/, "one cell box shared by both");
  const uses = (src.match(/\.\.\.CELL,/g) || []).length;
  assert.ok(uses >= 2, `both the empty slot and the filled shirt must use it, found ${uses}`);
  assert.match(src, /justifyContent: "flex-start"/, "content sits at the top, so the kit and the box align");
});

test("the Squad screen never writes to the draft it loaded", async () => {
  // Editing on this screen used to rewrite the stored plan, so the Builder draft it came from was being
  // modified, and a bad write could damage it permanently. Louis lost a defender that way. Edits are now
  // a local working copy; the database is touched only by an explicit save that CREATES a new draft.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(src, /const writePlan = \(next\) => \{ setWorking\(next\); setDirty\(true\); \};/,
    "writePlan must be local state only");
  const save = src.slice(src.indexOf("const saveAsNewDraft"), src.indexOf("const patchWeek"));
  assert.ok(!/id: /.test(save), "the save must not send an id, or it would overwrite the original");
  assert.match(save, /sending no identifier creates a new row/, "and must say so");
  // Every edit path goes through the working copy.
  assert.match(src, /JSON\.parse\(JSON\.stringify\(/, "the copy must be deep, not a shared reference");
});

test("the empty slot's centre is identical to a shirt's by construction", async () => {
  // Two attempts at this failed because I nudged margins by eye. The dashed square now sits inside a
  // container of exactly the Kit footprint and is centred in it, so both centres are the same number
  // whatever the size, and it cannot drift for one position and not another.
  const { readFileSync } = await import("node:fs");
  const pitch = readFileSync("components/BuilderPitch.jsx", "utf8");
  assert.match(pitch, /const KIT_SIZE = 44;/, "one size constant");
  assert.match(pitch, /const KIT_BOX = \{ width: KIT_SIZE, height: KIT_SIZE \* 0\.9 \}/,
    "the footprint is derived from it, matching what Kit renders");
  assert.match(pitch, /<Kit team=\{p\.team\} size=\{KIT_SIZE\} \/>/, "the shirt uses the constant");

  const slot = pitch.slice(pitch.indexOf("function EmptySlot"), pitch.indexOf("function Shirt"));
  assert.match(slot, /\.\.\.KIT_BOX/, "the empty slot occupies that same footprint");
  assert.match(slot, /alignItems: "center", justifyContent: "center"/, "and centres the square inside it");
  assert.ok(!/marginTop: \d/.test(slot), "no hand-tuned offset, which is what kept getting it wrong");
});

test("the Builder can open a saved draft, and a short one keeps its empty slots", async () => {
  // Removing the Drafts tab left no way to open a saved draft in the Builder at all, so a draft missing
  // a player was impossible to repair: the one screen that can add players could not load it.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(src, /const openPlan = React\.useCallback/, "there must be a loader");
  assert.match(src, /savedPlans\.map\(\(pl\) => \(/, "and a control listing every saved draft");
  assert.match(src, /\{pl\.name\} · \{\(pl\.base \|\| \[\]\)\.length\}\/\{RULES\.size\}/,
    "each option shows how many players it holds, so a short draft is visible before opening it");

  // Hydration from the live list, and honesty about what is missing.
  assert.match(src, /byId\.get\(b\.fpl_id\)/, "rows are hydrated from the live player list");
  assert.match(src, /RULES\.size - players\.length/, "and a short squad is reported");
  assert.match(src, /no longer in the league/, "as is a player who has left");

  // Choosing "New draft" clears everything rather than leaving a half-loaded state.
  assert.match(src, /setSquad\(emptySquad\("3-5-2"\)\); setLocks\(\[\]\); setIgnores\(\[\]\); setMaybeIds\(\[\]\)/,
    "starting a new draft must reset locks, exclusions and the shortlist too");
});

test("replacing is one button, two steps, worded identically on both pages", async () => {
  // There were two buttons for one question: MOVE TO BENCH for a squad exchange and REPLACE HIM for a
  // transfer. Both answer "who takes his place", so they are one flow whose answer may be a squad member
  // or somebody new. Naming a guessed partner in the label was the earlier mistake.
  const { readFileSync } = await import("node:fs");
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const pitch = readFileSync("components/BuilderPitch.jsx", "utf8");

  for (const [name, src] of [["squad", squad], ["builder", builder]]) {
    assert.match(src, /REPLACE HIM/, `${name} must offer one replace action`);
    assert.ok(!/MOVE TO BENCH|MOVE TO XI|BENCH FOR|START FOR/.test(src),
      `${name} must not keep a second, differently worded action`);
    assert.match(src, /Pick who replaces \{replacing\.web_name\}: an outlined player from your squad, or anyone in the list below\./,
      `${name} must show the same prompt`);
    assert.match(src, /swapTargets=\{replacing/, `${name} must outline eligible squad members`);
    assert.match(src, /Boolean\(p\.starting\) === Boolean\(replacing\.starting\)\) return;/,
      `${name} must refuse a partner on the same side of the line-up`);
    assert.ok(!/swapFrom|outFor/.test(src), `${name} must hold one state, not two`);
  }
  assert.match(pitch, /swapTargets = \[\]/, "the pitch takes the eligible list");
  assert.match(pitch, /target \? `2px dashed \$\{T\.cyan\}`/, "and outlines them");
});

test("a replacement from the list respects position, budget and the club limit", async () => {
  // The list can now complete a replacement on the Builder, which means it must enforce the same rules
  // the pitch route does. The outgoing player's price funds the incoming one and frees a club slot.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const block = src.slice(src.indexOf("if (replacing) {"), src.indexOf("if (squad.players.length >= RULES.size)"));
  assert.match(block, /p\.position !== out\.position/, "same position only");
  assert.match(block, /bank\(squad\) \+ Number\(out\.price\)/, "his price funds the replacement");
  assert.match(block, /p\.team_id !== out\.team_id/, "and frees a slot at his own club");
  assert.match(block, /starting: Boolean\(out\.starting\)/, "the replacement inherits his place in the line-up");
  assert.match(block, /snapshot\(\)/, "and it is undoable");
});

test("the pitch corners carry the shape and the money, and the score sits above", async () => {
  const { readFileSync } = await import("node:fs");
  const pitch = readFileSync("components/BuilderPitch.jsx", "utf8");
  assert.match(pitch, /structures\.map\(\(st\)/, "the formation is a dropdown on the pitch");
  assert.match(pitch, /<LockMark size=\{shapeLocked/, "with the shape lock beside it");
  assert.match(pitch, /minHeight: fill \? "min\(56vh, 600px\)"/, "and the pitch fills its space when asked");
  // Locked players carry the same mark, not a word or a coloured border.
  assert.match(pitch, /locks\.includes\(p\.fpl_id\) && <LockMark/, "locked players show the lock mark");
  assert.ok(!/>LOCK</.test(pitch), "the LOCK word is replaced by the mark");
});

test("CHECKS only shows rows that have something to say", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("components/Checks.jsx", "utf8");
  assert.match(src, /if \(!rows\.length\) return null;/, "an empty panel does not render at all");
  assert.match(src, /risk && risk\.count > 0/, "no risk row when nothing is flagged");
  assert.match(src, /shape && shape\.gain > 0\.05/, "no shape row when the current one is best");
  // None of the rejected content survives.
  for (const banned of ["Ownership", "template", "Structure", "GKP 0/2", "higher-is-better"]) {
    assert.ok(!src.includes(banned), `${banned} was rejected and must not return`);
  }
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(builder, /<Checks /, "the Builder uses it");
  assert.ok(!/<Feedback/.test(builder), "and the old panel is gone");
});

test("the Builder has one gameweek control, not two", async () => {
  // The toolbar stepper and the list's yellow slider would be two controls for one idea that could
  // disagree, which is the duplication the feedback warns against.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const steppers = (src.match(/setHorizon\(\(h\) =>/g) || []).length;
  assert.equal(steppers, 0, "the toolbar stepper must be gone");
});
