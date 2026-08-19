"use client";
import React from "react";
import { SlidersHorizontal } from "lucide-react";
import { lang } from "../lib/ui";

/* THE CONTROL SHELF.
 *
 * Every page control used to get its own full-width row, so five stacked rows pushed the pitch past
 * 460px on desktop and past 960px on a phone before a single player was visible. The shelf keeps the
 * same controls in one or two dense rows instead.
 *
 * Nothing is removed and nothing is unmounted. Items marked zeus-shelf-extra stay mounted at every
 * width; on a phone the stylesheet hides them until the shelf is opened, which means every filter,
 * select and toggle keeps its React state and every combination still applies exactly as before.
 * The toggle button is hidden on desktop, where the whole shelf is always open. */
export default function ControlShelf({ children, label = "CONTROLS", ariaLabel = "Page controls" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`zeus-shelf${open ? " is-open" : ""}`} aria-label={ariaLabel}>
      {children}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="fb-press zeus-shelf-toggle" style={lang(12.5, 700)}>
        <SlidersHorizontal size={14} />
        {open ? "HIDE" : label}
      </button>
    </div>
  );
}
