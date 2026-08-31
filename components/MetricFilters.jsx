"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

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

export default function MetricFilters({ conditions, setConditions, metrics, label = "CONDITIONS" }) {
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
    height: 30, background: T.plate, border: `1px solid ${T.line}`,
    borderRadius: 8, padding: "0 8px", ...val(13, T.xp), outline: "none",
  };
  const active = (conditions || []).filter((row) => row && Number.isFinite(Number(row.value))).length;

  return (
    <div data-zeus-metric-filters="v1"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12,
        background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radiusSm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={code(12, T.xp)}>{label}</span>
        {active > 0 && <span style={lang(12, 600)}>{active} applied</span>}
        <button type="button" onClick={add} className="fb-press"
          style={{ height: 28, padding: "0 12px", borderRadius: 8, background: T.green,
            border: "none", ...lang(12.5, 700, "#04130A") }}>
          ADD CONDITION
        </button>
        {(conditions || []).length > 0 && (
          <button type="button" onClick={() => setConditions([])} className="fb-press"
            style={{ height: 28, padding: "0 12px", borderRadius: 8, background: T.plate,
              border: `1px solid ${T.line}`, ...lang(12.5, 700) }}>
            CLEAR
          </button>
        )}
      </div>

      {(conditions || []).map((row, index) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={row.metric || first || ""}
            onChange={(event) => update(index, { metric: event.target.value })}
            aria-label="Metric" className="zeus-strip-select"
            style={{ ...box, minWidth: 132 }}>
            {options.map((metric) => (
              <option key={metric.key} value={metric.key} style={{ background: T.card }}>{metric.label}</option>
            ))}
          </select>
          <select value={row.op || "gte"}
            onChange={(event) => update(index, { op: event.target.value })}
            aria-label="Comparison" className="zeus-strip-select"
            style={{ ...box, width: 64 }}>
            {OPERATORS.map((operator) => (
              <option key={operator.key} value={operator.key} style={{ background: T.card }}>{operator.label}</option>
            ))}
          </select>
          <input type="number" inputMode="decimal" step={0.1} value={row.value ?? ""}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="value" aria-label="Value" style={{ ...box, width: 92 }} />
          <button type="button" onClick={() => remove(index)} className="fb-press"
            aria-label="Remove this condition"
            style={{ height: 30, width: 34, borderRadius: 8, background: T.plate,
              border: `1px solid ${T.line}`, ...lang(14, 700) }}>
            ×
          </button>
        </div>
      ))}

      {!(conditions || []).length && (
        <span style={{ ...lang(12.5, 600), opacity: 0.8 }}>
          Every condition must hold at once. A player with no figure for a metric is excluded rather than
          treated as zero.
        </span>
      )}
    </div>
  );
}
