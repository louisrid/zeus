import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function structuralCssErrors(source) {
  const errors = [];
  let depth = 0;
  let quote = null;
  let inComment = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth < 0) {
        errors.push(`unexpected closing brace at character ${i}`);
        depth = 0;
      }
    }
  }

  if (inComment) errors.push("unterminated comment");
  if (quote) errors.push("unterminated string");
  if (depth !== 0) errors.push(`${depth} unclosed block${depth === 1 ? "" : "s"}`);
  return errors;
}

test("global CSS has balanced blocks before Next build", () => {
  const source = readFileSync("app/globals.css", "utf8");
  assert.deepEqual(structuralCssErrors(source), []);
  assert.match(source, /\.zeus-builder-workspace \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 380px\)/);
  assert.match(source, /@media \(max-width: 1320px\) \{[\s\S]*\.zeus-builder-workspace \{ grid-template-columns: 1fr; \}[\s\S]*\.zeus-builder-toolbar/);
  assert.match(source, /@media \(max-width: 600px\) \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(source, /@media \(max-width: 520px\) \{[\s\S]*\.zeus-gw-preset[\s\S]*\}\s*$/);
});
