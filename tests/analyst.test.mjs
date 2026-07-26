import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/analyst/route.js", import.meta.url), "utf8");

test("the key never reaches the browser", () => {
  assert.match(route, /process\.env\.OPENROUTER_API_KEY/);
  const ui = readFileSync(new URL("../components/AskAnalyst.jsx", import.meta.url), "utf8");
  assert.ok(!/OPENROUTER/.test(ui), "the client component must not touch the key or the provider");
  assert.match(ui, /fetch\("\/api\/analyst"/, "the client speaks only to our own route");
});

test("the cap fails closed", () => {
  assert.match(route, /if \(spent\.error\) return json\(\{ ok: false/, "a missing ledger must refuse, not spend blind");
  assert.match(route, /monthSpend >= CAP/, "the cap is checked before any tokens are bought");
  const capIdx = route.indexOf("monthSpend >= CAP");
  const callIdx = route.indexOf("openrouter.ai");
  assert.ok(capIdx < callIdx, "the cap check must precede the provider call");
});

test("every call is ledgered, even when the provider hides usage", () => {
  assert.match(route, /from\("ai_spend"\)\.insert/);
  assert.match(route, /: 0\.01; \/\/ no usage returned/, "unknown usage ledgers a conservative penny, never zero");
});

test("the rules forbid inventing numbers and require the payload's figures verbatim", () => {
  assert.match(route, /Never estimate a number that is not given/);
  assert.match(route, /payload's figures verbatim/);
});
