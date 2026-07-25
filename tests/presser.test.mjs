// The presser parser's validation boundary. Model output is untrusted input: anything that
// fails these checks is logged and dropped, never inserted (02 §6.2).
import test from "node:test";
import assert from "node:assert/strict";
import { toText, chunk, validateSignals } from "../jobs/presser_pull.mjs";

const names = new Map([["saka", 11], ["haaland", 22], ["van dijk", 33]]);
const SRC = "https://example.com/team-news";

test("html is reduced to plain text with scripts and entities handled", () => {
  const html = `<html><head><style>.a{color:red}</style><script>var x=1;</script></head>
    <body><h1>Team&nbsp;news</h1><p>Saka is &quot;fit&quot; &amp; available</p><!-- hidden --></body></html>`;
  const text = toText(html);
  assert.equal(text.includes("var x"), false);
  assert.equal(text.includes("color:red"), false);
  assert.equal(text.includes("hidden"), false);
  assert.equal(text.includes("<"), false);
  assert.match(text, /Team news/);
  assert.match(text, /Saka is "fit" & available/);
});

test("chunking covers the whole input without loss", () => {
  const text = "x".repeat(21000);
  const parts = chunk(text, 9000);
  assert.equal(parts.length, 3);
  assert.equal(parts.join("").length, text.length);
});

test("a well-formed signal is accepted and mapped to a player id", () => {
  const { good, bad } = validateSignals(
    { signals: [{ player: "Saka", signal: "doubt", confidence: 0.6, summary: "Carrying a knock, assessed late.", source_url: "https://example.com/a" }] },
    names, SRC
  );
  assert.equal(bad.length, 0);
  assert.equal(good.length, 1);
  assert.equal(good[0].player_id, 11);
  assert.equal(good[0].confidence, 0.6);
  assert.equal(good[0].source_url, "https://example.com/a");
});

test("an unknown player is rejected rather than guessed at", () => {
  const { good, bad } = validateSignals(
    { signals: [{ player: "Some Trialist", signal: "out", confidence: 0.9 }] }, names, SRC
  );
  assert.equal(good.length, 0);
  assert.equal(bad.length, 1);
  assert.match(bad[0].reason, /unknown player/);
});

test("a signal outside the enum is rejected", () => {
  const { good, bad } = validateSignals(
    { signals: [{ player: "Haaland", signal: "probably fine", confidence: 0.8 }] }, names, SRC
  );
  assert.equal(good.length, 0);
  assert.match(bad[0].reason, /bad signal/);
});

test("confidence must be a number inside zero and one", () => {
  for (const c of [-0.2, 1.4, "high", null, undefined, NaN]) {
    const { good, bad } = validateSignals({ signals: [{ player: "Haaland", signal: "out", confidence: c }] }, names, SRC);
    assert.equal(good.length, 0, `accepted confidence ${c}`);
    assert.match(bad[0].reason, /bad confidence/);
  }
});

test("malformed payloads are handled rather than thrown on", () => {
  for (const payload of [null, {}, { signals: null }, { signals: "none" }]) {
    const { good, bad } = validateSignals(payload, names, SRC);
    assert.equal(good.length, 0);
    assert.ok(bad.length >= 1);
  }
  const mixed = validateSignals({ signals: [null, 5, { player: "Saka", signal: "out", confidence: 0.9 }] }, names, SRC);
  assert.equal(mixed.good.length, 1);
  assert.equal(mixed.bad.length, 2);
});

test("a bad source url falls back to the page it came from", () => {
  const { good } = validateSignals(
    { signals: [{ player: "Van Dijk", signal: "confirmed", confidence: 0.95, source_url: "javascript:alert(1)" }] },
    names, SRC
  );
  assert.equal(good[0].source_url, SRC);
});

test("set-piece news is tagged so penalty duty can ride the same pipeline", () => {
  const { good } = validateSignals(
    { signals: [{ player: "Haaland", signal: "confirmed", confidence: 0.9, summary: "SET PIECE: taking penalties from now on." }] },
    names, SRC
  );
  assert.equal(good[0].setPiece, true);
  const plain = validateSignals(
    { signals: [{ player: "Haaland", signal: "confirmed", confidence: 0.9, summary: "Fit and starting." }] }, names, SRC
  );
  assert.equal(plain.good[0].setPiece, false);
});

test("summaries are truncated rather than trusted to be short", () => {
  const { good } = validateSignals(
    { signals: [{ player: "Saka", signal: "out", confidence: 0.9, summary: "y".repeat(900) }] }, names, SRC
  );
  assert.equal(good[0].summary.length, 400);
});
