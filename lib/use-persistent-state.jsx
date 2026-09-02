"use client";
import React from "react";

/* REMEMBERING WHAT WAS SET LAST TIME.
 *
 * Filters were rebuilt from scratch on every visit: position, club, price, ownership, sort, the gameweek
 * range and every stacked condition, all typed in again to ask the same question as yesterday.
 *
 * The trap this hook exists to avoid is the one that broke the squad page's range on the first attempt.
 * Bounds like the price range and the gameweek range are null until the player list arrives, so an
 * effect that saves on every change will write those placeholders over the stored value before the real
 * one is known, and the choice is destroyed on load rather than restored. So nothing is read or written
 * until `ready` is true, and a value the caller cannot yet interpret is never persisted.
 */

const NAMESPACE = "zeus.ui";

function read(key) {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(`${NAMESPACE}.${key}`);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    /* Corrupt or blocked storage must never stop the page rendering. */
    return undefined;
  }
}

function write(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value));
  } catch { /* full or blocked: losing the memory is acceptable, throwing is not */ }
}

/* A drop-in replacement for useState that survives a reload.
 *
 * ready   hold restoration until the caller can make sense of a stored value. Defaults to true for
 *         simple state like a search box, which needs nothing loaded first.
 * revive  given the stored value, return what should be used, or undefined to reject it. This is where
 *         a remembered range gets clamped to what the data now covers, so a stored choice can never
 *         outlive the data behind it.
 */
export function usePersistentState(key, initial, { ready = true, revive = null } = {}) {
  const [value, setValue] = React.useState(initial);
  const [restored, setRestored] = React.useState(false);

  React.useEffect(() => {
    if (restored || !ready) return;
    const stored = read(key);
    if (stored !== undefined) {
      const revived = revive ? revive(stored) : stored;
      if (revived !== undefined && revived !== null) setValue(revived);
    }
    setRestored(true);
    // revive is redefined on every render by design; restoration runs once, guarded by `restored`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, restored]);

  React.useEffect(() => {
    if (!restored || !ready) return;
    if (value === null || value === undefined) return;
    write(key, value);
  }, [key, ready, restored, value]);

  return [value, setValue, restored];
}

/* Forget one remembered value. Used by a reset control, which should clear the memory as well as the
 * screen: a reset that leaves the old filters stored comes back on the next visit. */
export function clearPersistentState(key) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(`${NAMESPACE}.${key}`); } catch { /* nothing to do */ }
}
