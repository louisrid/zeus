"use client";
import React from "react";

/* THE CONTROL SHELF.
 *
 * A plain grouping wrapper for a page's control rows. It holds them together at a tight gap so the
 * rows read as one block rather than as separate floating panels.
 *
 * It deliberately does NOT hide anything. An earlier version collapsed the controls behind a button on
 * narrow screens; controls you cannot see are controls you cannot use, so every control is on screen at
 * every width, and narrow screens simply stack them. */
export default function ControlShelf({ children, ariaLabel = "Page controls" }) {
  return (
    <div className="zeus-shelf" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
