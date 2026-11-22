"use client";
import React from "react";
import { ChevronDown } from "lucide-react";
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
        className="fb-press zeus-ctl zeus-btn zeus-btn-grey zeus-disclosure-toggle">
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

/* MENU. The actions that are not needed every visit, in a fold under the settings. */
export function Menu({ label = "More", items, className = "", ariaLabel = "More actions" }) {
  /* Opens in place like the "Gameweeks and chips" fold: a grey bar, and under it every extra action as an
     ordinary button in its usual colour. No pop-up, nothing to aim at. */
  const [open, setOpen] = React.useState(false);
  const visible = (items || []).filter((item) => !item.hidden);
  if (!visible.length) return null;
  return (
    <Disclosure label={label === "More" ? "More actions" : label} open={open} onToggle={() => setOpen((value) => !value)}
      ariaLabel={ariaLabel} className={`zeus-menu-fold ${className}`.trim()}>
      <div className="zeus-menu-grid">
        {visible.map((item) => (
          <Button key={item.key || item.label} tone={item.tone || "white"} title={item.title} disabled={item.disabled}
            onClick={() => { setOpen(false); item.onClick && item.onClick(); }}>
            {item.label}
          </Button>
        ))}
      </div>
    </Disclosure>
  );
}

/* A line of plain text inside a row (a count, a note). Body colour, never grey. */
export function PanelNote({ children, className = "" }) {
  return <span className={`zeus-panel-note ${className}`.trim()} style={lang(14, 600, T.text)}>{children}</span>;
}
