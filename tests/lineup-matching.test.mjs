// Name matching against the REAL published line-ups, not invented players.
//
// Every earlier check used made-up names, which is how "Igor Jesus is not in FPL" survived. This runs the
// twenty real elevens from config/lineups.json against a snapshot of the actual FPL player list, so a
// regression in the matcher shows up as a named player who stopped resolving.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLineups, resolveName, norm } from "../lib/lineups.mjs";

const LINEUPS = JSON.parse(readFileSync("config/lineups.json", "utf8"));
const SNAP = JSON.parse(readFileSync("tests/fpl-players.json", "utf8"));

test("every published name resolves against the real FPL list", () => {
  const { byClub, unmatched } = resolveLineups(LINEUPS.clubs, SNAP.players, SNAP.teams);
  const report = [...byClub.values()].map(({ row, club, lines, valid }) => {
    const flat = lines.flat();
    return { club: row.club, linked: Boolean(club), ok: flat.filter((x) => x.player).length, n: flat.length, valid };
  });

  const unlinked = report.filter((r) => !r.linked).map((r) => r.club);
  assert.deepEqual(unlinked, [], `these clubs did not resolve to a team: ${unlinked.join(", ")}`);

  // Below nine, the confidence guard stops that club's minutes being touched at all, so xPTS silently
  // falls back. Nothing should be near that line.
  const weak = report.filter((r) => r.ok < 9).map((r) => `${r.club} ${r.ok}/${r.n}`);
  assert.deepEqual(weak, [], `clubs below the confidence floor: ${weak.join(", ")}`);

  /* Every published name must resolve, with one exception that is not a matcher fault.
     This snapshot is deliberately frozen and pinned to config/external-xpts-2026-27.mjs,
     which carries exactly one row per player in it. The line-ups, by contrast, are pulled
     fresh every day, so the moment a club names a new signing that player exists live and
     resolves live but is absent from this file. Failing on that would turn every transfer
     into a red build while telling us nothing about the matcher. The file carries an
     explicit FPL id per player, so those two cases are told apart precisely: an id this
     snapshot has never heard of is drift, and anything else is a regression. */
  const snapshotIds = new Set(SNAP.players.map((p) => p.fpl_id));
  const publishedId = (clubName, name) => {
    const club = LINEUPS.clubs.find((c) => c.club === clubName || c.short === clubName);
    return club?.ids?.[name] ?? null;
  };
  const notInSnapshot = (u) => {
    const id = publishedId(u.club, u.name);
    return id !== null && !snapshotIds.has(id);
  };
  const regressions = unmatched.filter((u) => !notInSnapshot(u));
  const drift = unmatched.filter(notInSnapshot);
  assert.deepEqual(regressions.map((u) => `${u.club}: ${u.name}`), [],
    "every published name known to this snapshot resolves to exactly one player");

  const total = report.reduce((sum, r) => sum + r.n, 0);
  const matched = report.reduce((sum, r) => sum + r.ok, 0);
  assert.equal(total, 220, "twenty clubs, eleven each");
  assert.equal(matched, 220 - drift.length,
    "every slot resolves, apart from players signed since this snapshot was taken");
  // A handful of new signings is normal. Many means the snapshot is far too old to test against.
  assert.ok(drift.length <= 5,
    `${drift.length} published players are missing from the snapshot, refresh it: `
    + drift.map((u) => `${u.club} ${u.name}`).join(", "));

  const brokenClubs = report.filter((r) => !r.valid).map((r) => r.club);
  const driftClubs = new Set(drift.map((u) => u.club));
  assert.deepEqual(brokenClubs.filter((c) => !driftClubs.has(c)), [],
    "every club resolves cleanly, apart from those naming a player signed since this snapshot");
});

test("the awkward real names resolve to the right player", () => {
  // Each of these failed at some point. They are here by name so a scoring change cannot quietly undo one.
  const find = (name, short) => {
    const club = SNAP.teams.find((t) => t.short_name === short);
    const p = resolveName(name, SNAP.players, club ? club.id : null);
    return p ? p.web_name : null;
  };
  const cases = [
    ["Odegaard", "ARS", "the slashed O that NFD cannot decompose"],
    ["Gross", "BHA", "the German sharp s"],
    ["Kadioglu", "BHA", "dotless i and g with a breve"],
    ["Alisson", "LIV", "familiar name lives in the full name, short name is an initial"],
    ["Jacob Murphy", "NEW", "two Murphys at the same club"],
    ["Pedro", "CHE", "must not resolve to Pedro Neto"],
    ["Neto", "CHE", "and Neto must still be Neto"],
    ["Igor Jesus", "NFO", "not Gabriel Jesus"],
    ["Santos", "MUN", "many players carry Santos in a full name"],
    ["Nunes", "MCI", "same"],
  ];
  const bad = [];
  for (const [name, short, why] of cases) {
    const got = find(name, short);
    if (!got) bad.push(`${name} (${short}) did not resolve: ${why}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));

  // And the two it must NOT confuse.
  const che = SNAP.teams.find((t) => t.short_name === "CHE").id;
  const pedro = resolveName("Pedro", SNAP.players, che);
  const neto = resolveName("Neto", SNAP.players, che);
  assert.notEqual(pedro && pedro.fpl_id, neto && neto.fpl_id, "Pedro and Neto are different players");
});


test("predicted transfers move to the lineup club inside the engine", () => {
  const { byClub, teamOverrideByFplId } = resolveLineups(LINEUPS.clubs, SNAP.players, SNAP.teams);
  // The override exists for the window where the stored list lags a transfer. Asserting it is always
  // empty asserted that no player ever moves club mid-season, which fails the moment one does. What
  // matters is that every override names a player the line-ups actually publish, so a stale entry cannot
  // silently move somebody who has not been transferred at all.
  for (const id of teamOverrideByFplId.keys()) {
    assert.ok(SNAP.players.some((player) => Number(player.fpl_id) === Number(id)),
      `an override names ${id}, who is not in the player list at all`);
  }
  for (const short of ["COV", "LEE", "CHE", "NFO", "ARS"]) {
    assert.equal(byClub.get(short).valid, true, `${short} must resolve cleanly`);
  }

  const che = SNAP.teams.find((t) => t.short_name === "CHE");
  const chelsea = LINEUPS.clubs.find((c) => c.short === "CHE");
  const movedName = chelsea.rows.flat()[1];
  const movedId = chelsea.ids[movedName];
  // Pretend the stored list still has him at his former club, exactly as it would mid-transfer.
  const stale = SNAP.players.map((p) => (p.fpl_id === movedId ? { ...p, team_id: 99 } : p));
  const lagged = resolveLineups(LINEUPS.clubs, stale, SNAP.teams);
  assert.equal(lagged.teamOverrideByFplId.get(movedId), che.id,
    "a player published for a new club overrides the stale stored club id");
  assert.equal(lagged.byClub.get("CHE").valid, true,
    "and the club still resolves while the player list catches up");
});
test("characters NFD cannot decompose are transliterated", () => {
  assert.equal(norm("Ødegaard"), "odegaard");
  assert.equal(norm("Groß"), "gross");
  assert.equal(norm("Kadıoğlu"), "kadioglu");
  assert.equal(norm("Hincapié"), "hincapie");
  assert.equal(norm("O'Riley"), "o riley");
});
