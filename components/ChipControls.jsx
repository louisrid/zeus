"use client";

import { Check, Crown, RefreshCcw, Users } from "lucide-react";
import { SQUAD_CHIPS } from "../lib/squad-projection.mjs";
import { T, S, code, lang } from "../lib/ui";

const ICONS = {
  wildcard: RefreshCcw,
  benchboost: Users,
  triplecaptain: Crown,
};

/* gw has no default. It used to fall back to 1, so a caller that forgot to pass one would quietly
   record a chip against a gameweek that may already have been played. */
export default function ChipControls({ chip = null, onChange, gw = null, disabled = false, compact = false,
  usage = null }) {
  /* A CHIP ALREADY SPENT LOOKS SPENT.
   *
   * Each chip may be played once per half of the season, and the validator has always enforced that. The
   * buttons said nothing about it, so a wildcard used in GW2 looked exactly as available in GW14 as one
   * never touched, and the only way to learn otherwise was to play it and be rejected. A used chip is now
   * struck through and says which gameweek took it, and it cannot be pressed for a different week.
   *
   * The half matters. A wildcard spent in GW3 is spent for the first half only: viewing GW25 it is
   * available again, and showing it as gone there would be a lie in the other direction. `usage` is
   * already resolved for the half being viewed by chipUsage(). */
  return (
    <section className={`zeus-chip-row${compact ? " zeus-chip-row-inline" : ""}`} data-zeus-feature="chip-controls-v1"
      aria-label={`FPL chips for gameweek ${gw}`}
      /* The 190px track meant three chips needed 590px, so on a phone they broke to one per row and
         three 54px blocks became the whole first screen. The class lets the stylesheet lay them out
         three across at any width; the grid here stays as the fallback. */
      style={compact
        ? { display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", minWidth: 0 }
        : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: 10,
            width: "100%", maxWidth: 760, margin: "0 auto" }}>
      {SQUAD_CHIPS.map((item) => {
        const active = chip === item.key;
        const playedIn = usage ? usage[item.key] : null;
        /* Spent, but not in the week being looked at: pressing it here could only produce a plan the
           validator would refuse. Spent in THIS week is simply the active state, which stays pressable
           so it can be taken back off. */
        const spentElsewhere = playedIn !== null && playedIn !== undefined && Number(playedIn) !== Number(gw);
        const Icon = ICONS[item.key];
        return (
          <button key={item.key} type="button" aria-pressed={active} disabled={disabled || spentElsewhere}
            data-chip={item.key} onClick={() => onChange?.(active ? null : item.key)} className="fb-press"
            title={spentElsewhere ? `${item.label} was played in GW${playedIn}` : item.label}
            style={{ minWidth: 0, minHeight: compact ? 32 : 44, padding: compact ? "3px 7px" : "6px 10px", borderRadius: S.radiusSm,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              background: active ? T.green : T.card,
              border: `1px solid ${active ? T.green : T.line}`,
              boxShadow: active ? "0 0 0 2px rgba(0,255,133,0.18)" : "none",
              opacity: disabled ? 0.45 : spentElsewhere ? 0.5 : 1,
              cursor: spentElsewhere ? "not-allowed" : undefined,
              ...lang(compact ? 12 : 13, 700, active ? "#04130A" : "#FFFFFF") }}>
            <Icon size={compact ? 14 : 18} color={active ? "#04130A" : "#FFFFFF"} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: spentElsewhere ? "line-through" : "none" }}>
              {item.label}
            </span>
            {spentElsewhere && (
              <span style={{ ...code(12, T.pink) }}>GW{playedIn}</span>
            )}
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
