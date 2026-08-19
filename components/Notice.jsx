"use client";
import { X } from "lucide-react";
import { T, S, lang } from "../lib/ui";

/* ONE STATUS LINE, NOT A WARNING PANEL.
 *
 * Ordinary states used to be announced in full-width blocks on alarm-red backgrounds: a draft holding
 * fourteen players instead of fifteen, or a swap waiting for its second player. Neither is a fault, and
 * neither needed a red box or a row of its own. A notice is one 34px line that sits with the controls.
 *
 * tone "info" is the default. tone "risk" is reserved for something actually at risk, so red keeps
 * meaning red. */
const TONES = {
  info: { border: T.line, bg: T.card, ink: "#FFFFFF" },
  active: { border: T.cyan, bg: T.card, ink: "#FFFFFF" },
  risk: { border: T.pink, bg: T.card, ink: T.pink },
};

export default function Notice({ children, tone = "info", action = null, onDismiss = null, label }) {
  const t = TONES[tone] || TONES.info;
  return (
    <section className="zeus-notice" aria-label={label} data-tone={tone}
      style={{ border: `1px solid ${t.border}`, background: t.bg }}>
      <span style={lang(13.5, 600, t.ink)}>{children}</span>
      {action}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="fb-press zeus-notice-close"
          style={{ border: `1px solid ${T.line}`, background: T.plate }}>
          <X size={13} color="#FFFFFF" />
        </button>
      )}
    </section>
  );
}

export function NoticeButton({ children, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="fb-press zeus-notice-button"
      style={{ height: S.ctrlSm, background: T.plate, border: `1px solid ${T.line}`, ...lang(12.5, 700) }}>
      {children}
    </button>
  );
}
