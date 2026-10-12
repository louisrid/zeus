"use client";
import React from "react";
import { S, lang, Stepper } from "../lib/ui";
import { Button, Select } from "./Panel";

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

/* How many conditions are actually narrowing the list: a row with no number yet is not one. */
export function activeConditionCount(conditions) {
  return (conditions || []).filter((row) => row && Number.isFinite(Number(row.value)) && String(row.value).trim() !== "").length;
}

/* THE CONDITIONS BLOCK. A label line with ADD CONDITION (green: it does something) and CLEAR (red), then
   one rule per line: the metric, the comparison, the number with its stepper, and a remove button. It
   takes a full line of whatever panel it sits in. `bare` drops the surrounding card so a page can put
   the conditions inside its own panel; without it the block is a small panel of its own. */
export default function MetricFilters({ conditions, setConditions, metrics, label = "Conditions", bare = false }) {
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

  const active = activeConditionCount(conditions);

  const rows = (conditions || []).map((row, index) => (
    <div key={index} className="zeus-condition-row">
      <Select value={row.metric || first || ""} className="zeus-condition-metric zeus-condition"
        onChange={(event) => update(index, { metric: event.target.value })} aria-label="Metric">
        {options.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
      </Select>
      <Select value={row.op || "gte"} className="zeus-condition-op zeus-condition"
        onChange={(event) => update(index, { op: event.target.value })} aria-label="Comparison">
        {OPERATORS.map((operator) => <option key={operator.key} value={operator.key}>{operator.label}</option>)}
      </Select>
      <Stepper label="value" size="panel" onStep={(dir) => {
        const key = String(row.metric || first || "");
        const step = /price|cost|xg|xa|value/i.test(key) ? 0.1 : 1;
        const next = Math.round(((Number(row.value) || 0) + dir * step) * 100) / 100;
        update(index, { value: String(next) });
      }}>
        <input className="zeus-ctl zeus-input zeus-input-num zeus-condition" type="number" inputMode="decimal" step={0.1}
          value={row.value ?? ""} onChange={(event) => update(index, { value: event.target.value })}
          placeholder="value" aria-label="Value" />
      </Stepper>
      <Button tone="red" className="zeus-condition-remove" onClick={() => remove(index)}
        aria-label="Remove this condition">×</Button>
    </div>
  ));

  const block = (
    <div data-zeus-metric-filters="v3" className="zeus-conditions zeus-panel-scope">
      <div className="zeus-conditions-head">
        <span className="zeus-field-label" style={lang(S.ctrlLabel, 700)}
          title="Every condition must hold at once. A player with no figure for a metric is excluded rather than treated as zero.">
          {label}{active > 0 ? ` · ${active} applied` : ""}
        </span>
        <div className="zeus-conditions-actions">
          <Button tone="green" onClick={add}>{(conditions || []).length ? "ADD" : "ADD CONDITION"}</Button>
          {(conditions || []).length > 0 && (
            <Button tone="red" onClick={() => setConditions([])}>CLEAR</Button>
          )}
        </div>
      </div>
      {rows.length > 0 && <div className="zeus-conditions-list">{rows}</div>}
    </div>
  );
  if (bare) return block;
  return <div className="zeus-panel zeus-panel-conditions">{block}</div>;
}
