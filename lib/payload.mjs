/* ANALYST PAYLOAD EXPORT.
 *
 * The whole value of an in-app Analyst, at no running cost. This assembles everything a model would
 * need to answer a question about this squad into plain text, ready to paste into a Claude project.
 * No API call, no spend cap, no per-call cost, no memory tables: the project already remembers.
 *
 * The deliberate limits, per DECISIONS: nothing here invents a number, and every projected figure
 * carries the label the app itself uses, so a payload can never present an unvalidated projection as
 * a validated one.
 */

const n1 = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "unknown" : Number(v).toFixed(1));

export function buildPayload({ squad, pool, scoreOf, metricName, evaluation, scores, oppOf, scale, gateOpen, fitted }) {
  const lines = [];
  const players = (squad && squad.players) || [];

  lines.push("FPLBOT ANALYST PAYLOAD");
  lines.push(`Metric shown in app: ${metricName}. Calibration gate ${gateOpen ? "PASSED" : "NOT PASSED"}.`);
  if (!gateOpen) lines.push("Every projected figure below is an interim score, not a validated projection. Do not treat it as one.");
  lines.push("");

  lines.push(`SQUAD (${players.length} of 15, shape ${squad && squad.structure ? squad.structure : "not set"})`);
  if (!players.length) lines.push("  nothing picked yet");
  for (const p of players) {
    const fx = oppOf ? oppOf(p) : null;
    const d = fx && scale ? scale.difficultyOf(fx.oppId, fx.home) : null;
    lines.push([
      `  ${p.web_name}`,
      `${p.team} ${p.position}`,
      `${n1(p.price)}m`,
      `owned ${n1(p.own)}%`,
      `score ${n1(scoreOf ? scoreOf(p) : null)}`,
      p.starting ? "starting" : "bench",
      squad && squad.captain === p.fpl_id ? "CAPTAIN" : null,
      fx ? `next ${fx.opp} ${fx.home ? "H" : "A"}${d ? ` difficulty ${d.difficulty}/100` : ""}` : "next fixture unpublished",
      p.status && p.status !== "a" ? `STATUS ${p.status}` : null,
      p.chance_of_playing !== null && p.chance_of_playing !== undefined && p.chance_of_playing < 100 ? `${p.chance_of_playing}% chance` : null,
    ].filter(Boolean).join(" | "));
  }
  lines.push("");

  if (evaluation) {
    lines.push("READOUTS");
    if (evaluation.points) lines.push(`  projected ${n1(evaluation.points.mean)} (range ${n1(evaluation.points.p10)} to ${n1(evaluation.points.p90)})`);
    if (evaluation.structure) {
      const s = evaluation.structure;
      lines.push(`  bank ${n1(s.bank)} | bench spend ${n1(s.benchSpend)} | bench floor ${n1(s.benchQuality)} | premiums ${s.premiums}`);
    }
    if (evaluation.risk) lines.push(`  risk flags ${evaluation.risk.count}${(evaluation.risk.items || []).length ? ": " + evaluation.risk.items.map((r) => `${r.player.web_name} ${r.kind}`).join(", ") : ""}`);
    if (evaluation.captaincy && evaluation.captaincy.ranked) {
      lines.push(`  armband options: ${evaluation.captaincy.ranked.slice(0, 3).map((r) => `${r.p.web_name} ${n1(r.ev)}`).join(", ")}`);
    }
    lines.push("");
  }

  if (scores) {
    lines.push("SCORES (0 to 100, measured against the best available from the current pool)");
    if (scores.overall !== null) lines.push(`  overall ${scores.overall}`);
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
      if (scores.lines && scores.lines[pos] !== null && scores.lines[pos] !== undefined) lines.push(`  ${pos} line ${scores.lines[pos]}`);
    }
    if (scores.captaincy !== null && scores.captaincy !== undefined) lines.push(`  captaincy ${scores.captaincy}`);
    if (scores.clubs) lines.push(`  clubs ${scores.clubs.clubs}, largest block ${scores.clubs.max}`);
    if (scores.template) {
      lines.push(`  template alignment ${scores.template.pct}% (${scores.template.shared} of ${scores.template.of}). NOT higher-is-better.`);
      if (scores.template.missing.length) lines.push(`  template players missing: ${scores.template.missing.map((p) => p.web_name).join(", ")}`);
      if (scores.template.unique.length) lines.push(`  differentials: ${scores.template.unique.map((p) => p.web_name).join(", ")}`);
    }
    if (scores.topRank) lines.push(`  top-rank effective ownership held ${scores.topRank.pct}% of the best possible fifteen`);
    lines.push("");
  }

  if (fitted) {
    lines.push("MODEL BASIS");
    if (fitted.history_blend_k) lines.push(`  points blend k ${fitted.history_blend_k.value} minutes`);
    if (fitted.minutes_blend_apps) lines.push(`  minutes blend ${fitted.minutes_blend_apps.value} appearances`);
    if (fitted.rate_shrinkage) lines.push(`  rate shrinkage ${fitted.rate_shrinkage.S_nineties} nineties toward the position mean`);
    if (fitted.promotion_factor) lines.push(`  promoted-club factor ${fitted.promotion_factor.overall}`);
    if (fitted.dixon_coles_rho) lines.push(`  Dixon-Coles rho ${fitted.dixon_coles_rho.value} (fitted and rejected on evidence)`);
    lines.push("");
  }

  if (pool && pool.length && scoreOf) {
    const owned = new Set(players.map((p) => p.fpl_id));
    const best = pool.filter((p) => !owned.has(p.fpl_id)).sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 12);
    lines.push("BEST AVAILABLE NOT OWNED");
    for (const p of best) lines.push(`  ${p.web_name} | ${p.team} ${p.position} | ${n1(p.price)}m | score ${n1(scoreOf(p))} | owned ${n1(p.own)}%`);
    lines.push("");
  }

  lines.push("Answer using these numbers only. If something needed is absent, say so rather than estimating it.");
  return lines.join("\n");
}


/* WHAT THE AI IS SUPPOSED TO DO WITH THIS. Pasting a wall of numbers into a chat without a brief gets
   a wall of waffle back. This header states the objective, the rules and the format expected. */
export function payloadBrief() {
  return [
    "You are advising on a Fantasy Premier League squad. The objective is rank one, not a safe finish.",
    "",
    "RULES:",
    "1. Answer only from the data below. If something needed is missing, say so; never estimate a number.",
    "2. Projected points are xP. Quote the figures given, verbatim.",
    "3. Ownership is exposure to the field, not quality. Say when a pick protects rank and when it can gain rank.",
    "4. Verdict first, then the numbers behind it. No hedging.",
    "5. Flag risk plainly: minutes, availability, single-fixture samples, anything marked interim.",
    "6. Where alternatives are listed, compare against them rather than inventing new names.",
    "",
    "ANSWER IN THIS ORDER: the single change you would make, what it costs, what it gains in xP,",
    "what it risks, and one alternative if the first is unavailable.",
    "",
  ].join("\n");
}

/* ALTERNATIVES PER POSITION, so the AI compares against a real shortlist instead of guessing. */
export function alternativesBlock({ pool, scoreOf, squad, limit = 6 }) {
  const owned = new Set((squad.players || []).map((p) => p.fpl_id));
  const lines = ["BEST AVAILABLE, NOT OWNED (by xP):"];
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    const top = pool
      .filter((p) => p.position === pos && !owned.has(p.fpl_id))
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, limit)
      .map((p) => `${p.web_name} ${p.team} ${Number(p.price).toFixed(1)} ${scoreOf(p).toFixed(1)}xP`);
    lines.push(`${pos}: ${top.join(" | ")}`);
  }
  return lines.join("\n");
}

/* THE MAYBE PILE. Players Louis is weighing but has not bought, carried into the payload so the AI
   knows what is already under consideration. */
export function maybesBlock({ maybes, scoreOf }) {
  if (!maybes || !maybes.length) return "";
  const rows = maybes.map((p) => `${p.web_name} ${p.team} ${p.position} ${Number(p.price).toFixed(1)} ${scoreOf(p).toFixed(1)}xP`);
  return `SHORTLIST UNDER CONSIDERATION:\n${rows.join("\n")}`;
}
