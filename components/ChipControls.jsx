"use client";

import { Check, Crown, RefreshCcw, Users } from "lucide-react";
import { SQUAD_CHIPS } from "../lib/squad-projection.mjs";
import { T, S, code, lang } from "../lib/ui";

const ICONS = {
  wildcard: RefreshCcw,
  benchboost: Users,
  triplecaptain: Crown,
};

export default function ChipControls({ chip = null, onChange, gw = 1, disabled = false }) {
  return (
    <section data-zeus-feature="chip-controls-v1" aria-label={`FPL chips for gameweek ${gw}`}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10,
        width: "100%", maxWidth: 760, margin: "0 auto" }}>
      {SQUAD_CHIPS.map((item) => {
        const active = chip === item.key;
        const Icon = ICONS[item.key];
        return (
          <button key={item.key} type="button" aria-pressed={active} disabled={disabled}
            data-chip={item.key} onClick={() => onChange?.(active ? null : item.key)} className="fb-press"
            style={{ minWidth: 0, minHeight: 54, padding: "8px 12px", borderRadius: S.radiusSm,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              background: active ? T.green : T.card,
              border: `1px solid ${active ? T.green : T.line}`,
              boxShadow: active ? "0 0 0 2px rgba(0,255,133,0.18)" : "none",
              opacity: disabled ? 0.45 : 1,
              ...lang(13, 700, active ? "#04130A" : "#FFFFFF") }}>
            <Icon size={18} color={active ? "#04130A" : "#FFFFFF"} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
            {active && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...code(12, "#04130A") }}>
                <Check size={14} color="#04130A" /> GW{gw}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
