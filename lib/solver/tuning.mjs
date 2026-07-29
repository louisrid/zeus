/* THE MODEL'S ADJUSTABLE NUMBERS, IN ONE PLACE.
 *
 * Until now the model had exactly one adjustable number, the shrinkage, and it had been swept. Every other
 * value that shapes a projection was a fixed figure chosen by judgement and never measured: how much recent
 * form counts, how hard a fixture pushes a projection about, how much an unproven player should regress
 * toward his own team-mates, and so on. An unmeasured value is not wrong, it is unknown, and there is no way
 * to tell the difference without being able to vary it.
 *
 * This file makes each of them a parameter with a stated range. jobs/sweep.mjs walks those ranges against the
 * tuning seasons and judges every combination on the held-out season. Nothing here is a claim about the right
 * value. The DEFAULTS ARE DELIBERATELY THE CURRENT BEHAVIOUR, so adding this file changes no number anywhere
 * until a sweep has actually measured something and written it back.
 *
 * A parameter is only ever marked MEASURED by a sweep, and a MEASURED entry carries the date and the score
 * that chose it. Anything without that marking is read as the default and is still an open question.
 */

/* Each knob: what it means in plain terms, the range to search, and the step the sweep walks it in.
   `identity` records the setting at which the model behaves exactly as it did before this file existed. */
export const TUNING_SPEC = [
  {
    key: "recentFormWeight",
    what: "How much the last few gameweeks count against the whole season so far. 0 uses the season only.",
    from: 0, to: 0.9, step: 0.05, identity: 0,
  },
  {
    key: "recentFormWindow",
    what: "How many gameweeks count as recent. Only has any effect when the weight above is above zero.",
    from: 3, to: 12, step: 1, integer: true, identity: 6,
  },
  {
    key: "xgWeight",
    what: "How much shots and chances count against goals and assists actually scored. 0 uses outcomes only.",
    from: 0, to: 1, step: 0.05, identity: 0,
  },
  {
    key: "fixtureSensitivity",
    what: "How hard a hard opponent pushes a projection down. 1 is the current strength, 0 ignores the fixture.",
    from: 0, to: 2, step: 0.1, identity: 1,
  },
  {
    key: "matesWeight",
    what: "For a player with no record, how much his proven team-mates count against the league average.",
    from: 0, to: 1, step: 0.05, identity: 0.66,
  },
  {
    key: "bonusElasticity",
    what: "How much a player's bonus points scale with his underlying attacking output. 0 uses his own bonus rate.",
    from: 0, to: 2, step: 0.1, identity: 0,
  },
  {
    key: "promotionStrength",
    what: "How much of the measured promoted-club discount to apply. 1 applies it in full, 0 not at all.",
    from: 0, to: 2, step: 0.1, identity: 1,
  },
  {
    key: "minutesCurve",
    what: "How sharply a rotation risk falls. Above 1 punishes an uncertain starter harder than his minutes alone.",
    from: 0.5, to: 2.5, step: 0.1, identity: 1,
  },
];

/* The defaults ARE the identities. Changing one here changes the live app, which is why only a sweep may
   do it, and only by writing a MEASURED entry into config/fitted-params.json. */
export const DEFAULT_TUNING = Object.fromEntries(TUNING_SPEC.map((s) => [s.key, s.identity]));

export const TUNING_KEYS = TUNING_SPEC.map((s) => s.key);

const spec = (key) => TUNING_SPEC.find((s) => s.key === key);

/* Clamp to the stated range and refuse anything unreadable, so a typo in the config cannot silently
   become a model change. A rejected value falls back to the default rather than to zero. */
export function resolveTuning(overrides) {
  const out = { ...DEFAULT_TUNING };
  if (!overrides) return out;
  for (const key of TUNING_KEYS) {
    const raw = overrides[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const s = spec(key);
    out[key] = Math.max(s.from, Math.min(s.to, s.integer ? Math.round(n) : n));
  }
  return out;
}

/* Read the tuning block out of config/fitted-params.json. Only an entry marked MEASURED is used: an
   UNMEASURED entry is a record of an open question, not a value to run the model on. */
export function tuningFrom(fitted) {
  const block = fitted && fitted.tuning ? fitted.tuning : null;
  if (!block) return { ...DEFAULT_TUNING };
  const picked = {};
  for (const key of TUNING_KEYS) {
    const entry = block[key];
    if (!entry || entry.status !== "MEASURED") continue;
    picked[key] = entry.value;
  }
  return resolveTuning(picked);
}

/* How many of the knobs have actually been fitted. The backtest needs this to say whether a gap between
   the tuning seasons and the held-out season could be overfitting at all: with nothing fitted, it cannot be. */
export function fittedCount(fitted) {
  const block = fitted && fitted.tuning ? fitted.tuning : null;
  if (!block) return 0;
  return TUNING_KEYS.filter((k) => block[k] && block[k].status === "MEASURED").length;
}

/* ── CALIBRATION ────────────────────────────────────────────────────────────────────────────────────
 *
 * A projection can order players correctly and still be the wrong size. Measured on the archive, the
 * six-to-seven band projects over a point too high, and that is the band every transfer decision lives in.
 *
 * The fix is not a number typed into the model. It is a map from what the model says to what players in
 * that band actually scored, fitted on the tuning seasons and stored with the gaps it came from. The map is
 * forced to be increasing, so it can change the size of a projection but can never change the ORDER of two
 * players, which is the thing the model is best at and the thing worth protecting.
 */

/* Pool adjacent violators until the corrected values only ever rise. This is the standard fix for a
   calibration curve that wobbles because a band had few rows in it. */
export function monotoneKnots(pairs, weights) {
  const pts = (pairs || [])
    .map(([x, y], i) => ({ x: Number(x), y: Number(y), w: Number((weights || [])[i]) || 1 }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) return pts.map((p) => [p.x, p.y]);
  let i = 0;
  while (i < pts.length - 1) {
    if (pts[i].y <= pts[i + 1].y) { i++; continue; }
    const a = pts[i], b = pts[i + 1];
    const w = a.w + b.w;
    pts.splice(i, 2, { x: (a.x * a.w + b.x * b.w) / w, y: (a.y * a.w + b.y * b.w) / w, w });
    if (i > 0) i--;
  }
  return pts.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)]);
}

/* Read the calibration out of config/fitted-params.json, and only when it is marked MEASURED. */
export function calibrationFrom(fitted) {
  const c = fitted && fitted.xp_calibration ? fitted.xp_calibration : null;
  if (!c || c.status !== "MEASURED" || !Array.isArray(c.knots) || c.knots.length < 2) return null;
  return { knots: c.knots.map(([x, y]) => [Number(x), Number(y)]) };
}

/* Straight-line interpolation between the knots, continuing the end slope beyond them so a projection
   above anything ever measured is still corrected rather than pinned. Never returns below zero. */
export function applyCalibration(value, calibration) {
  const x = Number(value);
  if (!calibration || !Array.isArray(calibration.knots) || calibration.knots.length < 2) return value;
  if (!Number.isFinite(x)) return value;
  const k = calibration.knots;
  const last = k.length - 1;
  const at = (i, j) => {
    const dx = k[j][0] - k[i][0];
    return dx === 0 ? 0 : (k[j][1] - k[i][1]) / dx;
  };
  if (x <= k[0][0]) return Math.max(0, k[0][1] + (x - k[0][0]) * at(0, 1));
  if (x >= k[last][0]) return Math.max(0, k[last][1] + (x - k[last][0]) * at(last - 1, last));
  for (let i = 0; i < last; i++) {
    if (x >= k[i][0] && x <= k[i + 1][0]) {
      const t = (x - k[i][0]) / (k[i + 1][0] - k[i][0]);
      return Math.max(0, k[i][1] + t * (k[i + 1][1] - k[i][1]));
    }
  }
  return x;
}
