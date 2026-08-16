// The predicted line-ups page, which is where a data problem is most visible to the eye.
//
// Two faults are covered here because both shipped silently. A shirt drawn from the player's stored club
// put a transferred player in his former colours while the player list caught up, and the kit table was
// never updated when clubs came up, so the promoted sides rendered in the placeholder purple.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LINEUPS = JSON.parse(readFileSync("config/lineups.json", "utf8"));
const CLIENT = readFileSync("app/lineups/LineupsClient.jsx", "utf8");

// lib/ui.jsx cannot be imported by the plain node test runner, so the kit table is read from source.
const UI = readFileSync("lib/ui.jsx", "utf8");
const KITS = Object.fromEntries(
  [...UI.slice(UI.indexOf("export const KITS"), UI.indexOf("export function Kit"))
    .matchAll(/([A-Z]{3}):\s*\["(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})"\]/g)]
    .map((m) => [m[1], [m[2], m[3]]]),
);

test("every club in the league has its own kit colours", () => {
  const missing = LINEUPS.clubs.map((c) => c.short).filter((short) => !KITS[short]);
  assert.deepEqual(missing, [], `these clubs would render in the placeholder colour: ${missing.join(", ")}`);
  for (const club of LINEUPS.clubs) {
    const [body, sleeve] = KITS[club.short];
    assert.match(body, /^#[0-9A-Fa-f]{6}$/, `${club.short} body colour`);
    assert.match(sleeve, /^#[0-9A-Fa-f]{6}$/, `${club.short} sleeve colour`);
  }
});

test("the kit follows the club a player is published for", () => {
  assert.match(CLIENT, /<Kit team=\{short\}/,
    "the shirt must come from the published club, not from player.team");
  assert.doesNotMatch(CLIENT, /<Kit team=\{player \? player\.team : short\}/,
    "the stored club lags a transfer and must not choose the colours");
});

test("the dropdown offers every club and the pitch shape is read from the file", () => {
  assert.match(CLIENT, /LINEUPS\.clubs\.map\(\(c\) =>/, "the dropdown is built from the lineups file");
  assert.match(CLIENT, /onChange=\{\(e\) => onTeam\(e\.target\.value\)\}/, "and switching teams is wired");
  assert.equal(LINEUPS.clubs.length, 20, "twenty selectable clubs");
  assert.equal(new Set(LINEUPS.clubs.map((c) => c.short)).size, 20, "each listed once");
  // The drawn shape comes from the row lengths, so a formation change needs no code change.
  assert.match(CLIENT, /row\.rows\.slice\(1\)\.map\(\(r\) => r\.length\)\.join\("-"\)/);
  const shapes = new Set(LINEUPS.clubs.map((c) => c.rows.slice(1).map((r) => r.length).join("-")));
  assert.ok(shapes.size >= 3, `expected varied formations, got ${[...shapes].join(", ")}`);
});

test("every published club carries the metadata the page renders", () => {
  for (const club of LINEUPS.clubs) {
    assert.ok(club.fixture && /\((H|A)\)$/.test(club.fixture), `${club.short} needs a fixture with a venue`);
    assert.ok(club.updated, `${club.short} needs a team-news date`);
    assert.equal(Object.keys(club.ids || {}).length, 11, `${club.short} needs an id for all eleven`);
    const flat = club.rows.flat();
    assert.deepEqual(flat.slice().sort(), Object.keys(club.ids).sort(),
      `${club.short} rows and ids must name the same eleven players`);
  }
});

test("rows read from the team's own left to its own right", () => {
  /* The published source draws the goalkeeper at the top of the frame, which puts the team's right on
     the viewer's left. Transcribing that graphic literally mirrors every line, and the mirror is
     invisible in any positional check because a reversed back four is still four defenders. It has to
     be caught by naming full-backs whose side is not in question. */
  assert.equal(LINEUPS.orientation, "team_left_to_right", "the file must state its orientation");
  assert.ok(LINEUPS._orientation_note, "and explain how to verify it");

  const backLine = (short) => {
    const club = LINEUPS.clubs.find((c) => c.short === short);
    assert.ok(club, `${short} must be present`);
    return club.rows[1];
  };
  // Recognised left-backs must open the line and recognised right-backs must close it.
  const checks = [
    ["LIV", "Kerkez", "Frimpong"],
    ["AVL", "Maatsen", "Cash"],
    ["ARS", "Calafiori", "White"],
    ["MCI", "Gvardiol", "Matheus N."],
  ];
  for (const [short, leftBack, rightBack] of checks) {
    const line = backLine(short);
    assert.equal(line[0], leftBack, `${short}: ${leftBack} plays left, so he opens the line`);
    assert.equal(line[line.length - 1], rightBack, `${short}: ${rightBack} plays right, so he closes it`);
  }
});
