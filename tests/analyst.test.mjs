import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the retired Analyst route is inert: no provider, no key, no panel", () => {
  // Louis has no terminal, so retired files are overwritten rather than deleted. That makes "retired"
  // a state the tests have to police, otherwise a dead endpoint quietly stays live in production.
  const route = readFileSync("app/api/analyst/route.js", "utf8");
  assert.ok(!/openrouter\.ai|OPENROUTER_API_KEY|api\.anthropic|api\.openai/.test(route),
    "the retired route must not reference any AI provider or key");
  assert.match(route, /410/, "it must refuse rather than silently accept requests");
  const ui = readFileSync("components/AskAnalyst.jsx", "utf8");
  assert.ok(!/fetch\(/.test(ui), "the retired panel must make no requests");
});
