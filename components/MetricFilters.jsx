"use client";
import React from "react";
import { T, S, lang, val, code, Stepper } from "../lib/ui";

/* COMBINING FILTERS, RATHER THAN CHOOSING ONE.
 *
 * Price and ownership each had a control and nothing else did, so a question like "defenders under 6.0
 * clearing ten DEFCON per ninety with at least fifteen xPTS over my range" could not be asked: it had to
 * be sorted by one column and read by eye. Every metric the table already computes is available here as
 * a condition, and conditions stack, so the answer is the list rather than a starting point for scrolling.
 *
 * The conditions read through the caller's own metric readers, so a column and a filter on that column
 * can never disagree about what the number is. A metric that reads null for a player, such as DEFCON for
 * a keeper, fails a condition rather than counting as zero: no rate is not a rate of nothing.
 */

export const OPERATORS = [
  { key: "gte", label: "≥", test: (value, target) => value >= target },
  { key: "lte", label: "≤", test: (value, target) => value <= target },
  { key: "gt", label: ">", test: (value, target) => value > target },
  { key: "lt", label: "<", test: (value, target) => value < target },
];

const OPERATOR_BY_KEY = new Map(OPERATORS.map((operator) => [operator.key, operator]));

/* Applied by the caller inside its own list memo, so filtering stays one pass over the rows. */
export function passesConditions(player, conditions, readers) {
  for (const condition of conditions || []) {
    if (!condition || !condition.metric) continue;
    const target = Number(condition.value);
    if (!Number.isFinite(target)) continue;
    const reader = readers?.[condition.metric];
    if (typeof reader !== "function") continue;
    const raw = reader(player);
    if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) return false;
    const operator = OPERATOR_BY_KEY.get(condition.op) || OPERATOR_BY_KEY.get("gte");
    if (!operator.test(Number(raw), target)) return false;
  }
  return true;
}

export default function MetricFilters({ conditions, setConditions, metrics, label = "CONDITIONS", bare = false }) {
  const options = (metrics || []).filter((metric) => metric && metric.key);
  const first = options[0] ? options[0].key : null;

  const update = (index, patch) => {
    setConditions((conditions || []).map((row, position) => (position === index ? { ...row, ...patch } : row)));
  };
  const add = () => {
    if (!first) return;
    setConditions([...(conditions || []), { metric: first, op: "gte", value: "" }]);
  };
  const remove = (index) => {
    setConditions((conditions || []).filter((_row, position) => position !== index));
  };

  const box = {
    /* Design-system heights, not eyeballed ones. This panel had grown 28, 30 and 32 pixel controls sitting
       in one row, which reads as three slightly different controls rather than one set. */
    height: S.ctrlSm, background: T.plate, border: `1px solid ${T.line}`,
    borderRadius: S.radiusXs, padding: "0 8px", ...val(13), outline: "none",
  };
  const active = (conditions || []).filter((row) => row && Number.isFinite(Number(row.value))).length;

  /* ONE ROW. The label, ADD and CLEAR, then each condition as a compact group of three fields and a
     remove button, all wrapping in a single line instead of stacking a row per condition under a
     sentence of help. The help lives on the label's tooltip. bare drops the card so a page can put the
     conditions inside its own control panel. */
  const groups = (conditions || []).map((row, index) => (
    <span key={index} className="zeus-condition-group" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <select value={row.metric || first || ""}
        onChange={(event) => update(index, { metric: event.target.value })}
        aria-label="Metric" className="zeus-strip-select zeus-condition"
        style={{ ...box, minWidth: 96 }}>
        {options.map((metric) => (
          <option key={metric.key} value={metric.key} style={{ background: T.card }}>{metric.label}</option>
        ))}
      </select>
      <select value={row.op || "gte"}
        onChange={(event) => update(index, { op: event.target.value })}
        aria-label="Comparison" className="zeus-strip-select zeus-condition"
        style={{ ...box, width: 52 }}>
        {OPERATORS.map((operator) => (
          <option key={operator.key} value={operator.key} style={{ background: T.card }}>{operator.label}</option>
        ))}
      </select>
      <Stepper label="value" onStep={(dir) => {
        const key = String(row.metric || first || "");
        const step = /price|cost|xg|xa|value/i.test(key) ? 0.1 : 1;
        const next = Math.round(((Number(row.value) || 0) + dir * step) * 100) / 100;
        update(index, { value: String(next) });
      }}>
        <input className="zeus-condition" type="number" inputMode="decimal" step={0.1} value={row.value ?? ""}
          onChange={(event) => update(index, { value: event.target.value })}
          placeholder="value" aria-label="Value" style={{ ...box, width: 64, textAlign: "center" }} />
      </Stepper>
      <button type="button" onClick={() => remove(index)} className="fb-press"
        aria-label="Remove this condition"
        style={{ height: S.ctrlSm, width: 28, borderRadius: S.radiusXs, background: T.plate,
          border: `1px solid ${T.line}`, ...lang(14, 700) }}>
        ×
      </button>
    </span>
  ));

  /* THE CONDITIONS STACK. The label, ADD and CLEAR stay on the control row; the conditions themselves
     sit one under another in a list that takes a full line at the end of the panel (order puts it last
     among the row's items on desktop, where the row is display: contents; the phone stylesheet stacks
     the whole thing). One condition per line reads like a list of rules, which is what it is. */
  const list = groups.length > 0 && (
    <span className="zeus-conditions-list" style={{ order: 99, flexBasis: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {groups}
    </span>
  );
  const row = (
    <span data-zeus-metric-filters="v2" className="zeus-conditions-row"
      style={{ display: bare ? "contents" : "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
      <span style={code(12)} title="Every condition must hold at once. A player with no figure for a metric is excluded rather than treated as zero.">{label}</span>
      {active > 0 && <span style={lang(12, 600)}>{active} applied</span>}
      {list}
      <button type="button" onClick={add} className="fb-press"
        style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusXs, background: T.green,
          border: "none", ...lang(12.5, 700, "var(--on-green)") }}>
        {(conditions || []).length ? "ADD" : "ADD CONDITION"}
      </button>
      {(conditions || []).length > 0 && (
        <button type="button" onClick={() => setConditions([])} className="fb-press"
          style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusXs, background: T.danger,
            border: `1px solid ${T.danger}`, ...lang(12.5, 700, T.onDanger) }}>
          CLEAR
        </button>
      )}
    </span>
  );
  if (bare) return row;
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 12px",
      background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radiusSm }}>
      {row}
    </div>
  );
}
