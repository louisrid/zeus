import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestFirst, shownFigure } from "../lib/row-order.mjs";

test("a row reads best first by the figure on the plate, captain counted as shown", () => {
  const mids = [
    { id: "Gomez", xp: 4.1 }, { id: "Palmer", xp: 5.4 }, { id: "Gross", xp: 5.0, captain: true },
    { id: "Rogers", xp: 4.8 }, { id: "Tavernier", xp: 4.6 },
  ];
  const order = bestFirst(mids, (p) => shownFigure(p.xp, { captain: p.captain })).map((p) => p.id);
  assert.deepEqual(order, ["Gross", "Palmer", "Rogers", "Tavernier", "Gomez"]);
});

test("players with no figure go last and ties keep their order", () => {
  const row = [{ id: "a", xp: null }, { id: "b", xp: 3 }, { id: "c", xp: 3 }, { id: "d" }, { id: "e", xp: 6 }];
  assert.deepEqual(bestFirst(row, (p) => p.xp).map((p) => p.id), ["e", "b", "c", "a", "d"]);
  assert.equal(shownFigure(null, { captain: true }), null);
  assert.equal(shownFigure(4, { captain: true, multiplier: 3 }), 12);
});

test("every pitch sorts its rows with the shared helper", () => {
  for (const file of ["components/BuilderPitch.jsx", "components/Pitch.jsx", "app/lineups/LineupsClient.jsx"]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(src, /bestFirst\(/, `${file} must order its rows best first`);
  }
});
