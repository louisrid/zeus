"use client";
import React from "react";
import { T, S, Kit, Label, lang, val, code } from "../lib/ui";
import { PLAN_RULES, saleValue } from "../lib/plan.mjs";

/* THE TRANSFER PICKER.
 *
 * A transfer is one out, one in. That is a far smaller interaction than the Builder, so it happens here
 * rather than sending you to another screen and back: pick who leaves, then see only players you can
 * legally and affordably buy.
 *
 * The budget uses SALE VALUE, not current price. FPL returns the purchase price plus half of any rise,
 * so a player who has risen 0.4 does not fund a 0.4 upgrade. Showing current price here would let you
 * build a plan that cannot be entered.
 */
export default function TransferPicker({ squad, pool, gw, bank, ignores, xpOf, onConfirm, onClose }) {
  const [out, setOut] = React.useState(null);
  const [q, setQ] = React.useState("");

  const owned = new Set(squad.map((p) => p.fpl_id));
  const clubCount = new Map();
  for (const p of squad) clubCount.set(p.team_id, (clubCount.get(p.team_id) || 0) + 1);

  const sold = out ? saleValue(out.purchasePrice ?? out.price, out.price) : null;
  const spendable = out ? Number(bank || 0) + Number(sold ?? 0) : 0;

  const candidates = React.useMemo(() => {
    if (!out) return [];
    return (pool || [])
      .filter((p) => p.position === out.position)
      .filter((p) => !owned.has(p.fpl_id))
      .filter((p) => !(ignores || []).includes(p.fpl_id))
      .filter((p) => Number(p.price) <= spendable + 1e-9)
      .filter((p) => {
        // The outgoing player frees a slot at his own club, so that club's limit relaxes by one.
        const used = (clubCount.get(p.team_id) || 0) - (p.team_id === out.team_id ? 1 : 0);
        return used < PLAN_RULES.maxPerClub;
      })
      .filter((p) => !q || (p.web_name + " " + p.team).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (xpOf ? (xpOf(b) ?? 0) - (xpOf(a) ?? 0) : Number(b.price) - Number(a.price)))
      .slice(0, 40);
  }, [out, pool, q, spendable, ignores]);

  const Row = ({ p, onPick, right }) => (
    <button onClick={onPick} className="fb-hover"
      style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 62px 62px", gap: 9, alignItems: "center",
        height: 40, padding: "0 10px", borderRadius: 9, background: T.row, textAlign: "left", width: "100%" }}>
      <Kit team={p.team} size={19} />
      <span style={{ ...lang(13.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.web_name}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span style={val(13.5)}>{xpOf && xpOf(p) !== null ? Number(xpOf(p)).toFixed(1) : "—"}</span>
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span style={val(13.5, "#FFFFFF", 500)}>{right ?? Number(p.price).toFixed(1)}</span>
      </span>
    </button>
  );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(4,0,10,0.72)", display: "flex",
        alignItems: "flex-start", justifyContent: "center", padding: 40, zIndex: 50, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20,
          width: 620, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <Label color={T.green}>Transfer in GW{gw}</Label>
            <h2 style={{ margin: "5px 0 0", ...lang(19, 700) }}>
              {out ? `Replace ${out.web_name}` : "Who leaves?"}
            </h2>
          </div>
          <button onClick={onClose} className="fb-press"
            style={{ height: 34, padding: "0 14px", borderRadius: 999, background: T.plate, ...lang(13.5, 700) }}>
            CLOSE
          </button>
        </div>

        {!out ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 62px 62px", gap: 9, padding: "0 10px" }}>
              <span />
              <span style={code(13)}>PLAYER</span>
              <span style={{ ...code(13), textAlign: "center" }}>XP</span>
              <span style={{ ...code(13), textAlign: "center" }}>SELLS AT</span>
            </div>
            {squad.map((p) => (
              <Row key={p.fpl_id} p={p} onPick={() => setOut(p)}
                right={(saleValue(p.purchasePrice ?? p.price, p.price) ?? Number(p.price)).toFixed(1)} />
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ ...lang(13.5, 600) }}>
                Sells at {sold !== null ? sold.toFixed(1) : "—"}, so you can spend
              </span>
              <span style={val(15, T.green)}>{spendable.toFixed(1)}</span>
              <button onClick={() => { setOut(null); setQ(""); }} className="fb-press"
                style={{ height: 30, padding: "0 12px", borderRadius: 999, background: T.plate, ...lang(13, 700), marginLeft: "auto" }}>
                CHANGE
              </button>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club"
              style={{ height: 42, padding: "0 14px", borderRadius: 12, background: T.row,
                border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14, 600), outline: "none" }} />
            {candidates.length === 0 ? (
              <span style={{ ...lang(14, 600), lineHeight: 1.5 }}>
                Nobody in that position is affordable at {spendable.toFixed(1)} without breaking the club limit.
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {candidates.map((p) => (
                  <Row key={p.fpl_id} p={p}
                    onPick={() => onConfirm({
                      out: out.fpl_id, in: p.fpl_id,
                      position: p.position, team_id: p.team_id, price: Number(p.price),
                    })} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
