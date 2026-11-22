"use client";
import React from "react";
import GameweekRange from "./GameweekRange";
import { Field, Segmented } from "./Panel";
import { usePersistentState } from "../lib/use-persistent-state.jsx";

/* WHICH PLAYED GAMEWEEKS A RESULTS TABLE COVERS. Used by Attacks and Defences: the same FROM-TO picker as
   the Squad and Builder pages, plus one-tap Season, Last 6 and Last 3. Remembered for three hours, then
   back to the whole season. */
export function useResultsRange(key, bounds) {
  const [range, setRange, restored] = usePersistentState(key, null, {
    ready: Boolean(bounds),
    revive: (stored) => {
      if (!bounds || !Array.isArray(stored) || stored.length !== 2) return undefined;
      const from = Math.min(Math.max(Number(stored[0]), bounds.first), bounds.last);
      const to = Math.min(Math.max(Number(stored[1]), from), bounds.last);
      return [from, to];
    },
  });
  const from = range ? range[0] : bounds ? bounds.first : 1;
  const to = range ? range[1] : bounds ? bounds.last : 1;
  return { from, to, restored, setRange: (a, b) => setRange([Number(a), Number(b)]) };
}

export default function ResultsRange({ bounds, from, to, onChange }) {
  if (!bounds) return null;
  const quick = [
    { key: "season", label: "Season", from: bounds.first, to: bounds.last },
    { key: "last6", label: "Last 6", from: Math.max(bounds.first, bounds.last - 5), to: bounds.last },
    { key: "last3", label: "Last 3", from: Math.max(bounds.first, bounds.last - 2), to: bounds.last },
  ];
  const active = quick.find((q) => q.from === from && q.to === to);
  return (
    <>
      <GameweekRange from={from} to={to} min={bounds.first} max={bounds.last} compact onChange={onChange}
        description="The table counts only matches played in these gameweeks." />
      <Field label="Quick" wide>
        <Segmented ariaLabel="Quick gameweek ranges" value={active ? active.key : ""}
          onChange={(key) => { const q = quick.find((item) => item.key === key); if (q) onChange(q.from, q.to); }}
          options={quick.map((q) => ({ key: q.key, label: q.label }))} />
      </Field>
    </>
  );
}
