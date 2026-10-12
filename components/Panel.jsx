"use client";
import React from "react";
import { ChevronDown, Menu as MenuIcon } from "lucide-react";
import { T, S, lang } from "../lib/ui";

/* THE CONTROL PANEL.
 *
 * One control system for the Squad, Builder and Players pages. Each page has one panel; a panel is a
 * few rows; a row holds at most four controls on a desktop and two on a phone. Every control is the
 * same height (44 on a desktop, 52 on a phone, set once as CSS variables in globals.css), the one
 * primary action on the panel is a step taller and green, and everything that is not needed every
 * visit sits behind a Menu (actions) or a Disclosure (settings) rather than being removed.
 *
 * Nothing here carries an inline height or font size. The classes do, so the three pages cannot drift
 * apart, and a phone gets its larger scale from one media query rather than from a hundred overrides.
 *
 * Button tones follow the colour rules: green does, dark green is done, yellow copies, blue is selected
 * or on, white is neutral, red takes away. Show and hide toggles are green with a black arrow. */

export function Panel({ label, children, className = "" }) {
  return (
    <section className={`zeus-panel ${className}`.trim()} data-zeus-controls aria-label={label}>
      {children}
    </section>
  );
}

/* A row. Flex on a desktop, a two-column grid on a phone. `wide` children take the whole line. */
export function PanelRow({ children, className = "", ariaLabel, style, title }) {
  return (
    <div className={`zeus-panel-row ${className}`.trim()} aria-label={ariaLabel} style={style} title={title}>
      {children}
    </div>
  );
}

/* A labelled control: the label above, in sentence case at 13px, the control below at full height. */
export function Field({ label, children, title, wide = false, grow = false, className = "", role, ariaLabel, style }) {
  return (
    <div className={`zeus-field${wide ? " zeus-field-wide" : ""}${grow ? " zeus-grow" : ""} ${className}`.trim()}
      title={title} role={role} aria-label={ariaLabel} style={style}>
      {label ? <span className="zeus-field-label" style={lang(S.ctrlLabel, 700)}>{label}</span> : null}
      {children}
    </div>
  );
}

export const TONES = ["green", "greendark", "yellow", "blue", "white", "red"];

export function Button({ tone = "white", hero = false, wide = false, icon = null, className = "", children, ...rest }) {
  return (
    <button type="button" {...rest}
      className={`fb-press zeus-ctl zeus-btn zeus-btn-${tone}${hero ? " zeus-btn-hero" : ""}${wide ? " zeus-ctl-wide" : ""} ${className}`.trim()}>
      {icon}
      <span className="zeus-btn-label">{children}</span>
    </button>
  );
}

export function Select({ className = "", children, ...rest }) {
  return (
    <select {...rest} className={`zeus-ctl zeus-select ${className}`.trim()}>
      {children}
    </select>
  );
}

export function TextInput({ className = "", ...rest }) {
  return <input {...rest} className={`zeus-ctl zeus-input ${className}`.trim()} />;
}

/* Two controls that read as one range: FROM and TO, or a minimum and a maximum. */
export function Pair({ children, className = "" }) {
  return <div className={`zeus-pair ${className}`.trim()}>{children}</div>;
}

/* SEGMENTED. One control with several settings (the three chips, a season toggle). The chosen one is
   blue; the rest are white. Every segment is a full-height button. */
export function Segmented({ options, value, onChange, ariaLabel, disabled = false, stack = false, className = "" }) {
  return (
    <div role="group" aria-label={ariaLabel} className={`zeus-seg${stack ? " zeus-seg-stack" : ""} ${className}`.trim()}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button key={option.key} type="button" className={`fb-press zeus-ctl zeus-seg-item${active ? " zeus-seg-on" : ""}`}
            aria-pressed={active} disabled={disabled || option.disabled} title={option.title}
            onClick={() => onChange(option.key)}>
            {option.icon || null}
            <span className="zeus-btn-label" style={{ textDecoration: option.struck ? "line-through" : "none" }}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* A grey toggle that reveals a block of settings in place. The label says what is inside and the
   summary says its current state, so the block rarely has to be opened to be read. */
export function Disclosure({ label, summary = null, open, onToggle, children, className = "", ariaLabel }) {
  const id = React.useId();
  return (
    <div className={`zeus-disclosure${open ? " zeus-open" : ""} ${className}`.trim()}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
        className="fb-press zeus-ctl zeus-btn zeus-btn-green zeus-disclosure-toggle">
        <span className="zeus-btn-label">{label}</span>
        {summary ? <span className="zeus-disclosure-summary" style={lang(14, 600)}>{summary}</span> : null}
        <ChevronDown size={18} aria-hidden="true" className="zeus-chevron" />
      </button>
      {open && (
        <div id={id} className="zeus-disclosure-body" aria-label={ariaLabel}>
          {children}
        </div>
      )}
    </div>
  );
}

/* MENU. The actions that are not needed every visit, behind one grey button. Opens a list under the
   button: one action per row, the row's colour square says what kind of action it is (the same colour
   the action would have as a button), and the red ones sit last. Escape, a click outside, or choosing
   an item closes it. Nothing inside is ever unmounted from the page's state; only the list is. */
export function Menu({ label = "More", items, className = "", ariaLabel = "More actions" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const shown = (items || []).filter((item) => item && !item.hidden);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!shown.length) return null;
  const ordinary = shown.filter((item) => item.tone !== "red");
  const destructive = shown.filter((item) => item.tone === "red");
  const row = (item) => (
    <button key={item.key || item.label} type="button" role="menuitem" disabled={item.disabled} title={item.title}
      className={`fb-press zeus-menu-item zeus-menu-${item.tone || "white"}`}
      onClick={() => { setOpen(false); item.onClick?.(); }}>
      <span aria-hidden="true" className="zeus-menu-swatch" />
      <span className="zeus-btn-label">{item.label}</span>
    </button>
  );
  return (
    <div ref={ref} className={`zeus-menu${open ? " zeus-open" : ""} ${className}`.trim()}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}
        className="fb-press zeus-ctl zeus-btn zeus-btn-green zeus-menu-toggle">
        <MenuIcon size={18} aria-hidden="true" />
        <span className="zeus-btn-label">{label}</span>
        <ChevronDown size={18} aria-hidden="true" className="zeus-chevron" />
      </button>
      {open && (
        <div role="menu" aria-label={ariaLabel} className="zeus-menu-list">
          {ordinary.map(row)}
          {destructive.length > 0 && ordinary.length > 0 && <span aria-hidden="true" className="zeus-menu-gap" />}
          {destructive.map(row)}
        </div>
      )}
    </div>
  );
}

/* A line of plain text inside a row (a count, a note). Body colour, never grey. */
export function PanelNote({ children, className = "" }) {
  return <span className={`zeus-panel-note ${className}`.trim()} style={lang(14, 600, T.text)}>{children}</span>;
}
