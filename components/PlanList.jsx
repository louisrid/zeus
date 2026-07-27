"use client";
import React from "react";
import Link from "next/link";
import { T, S, Label, Kit, lang, val, code } from "../lib/ui";
import { PLAN_RULES, squadAt, validateAt, transferLedger } from "../lib/plan.mjs";

/* THE PLAN LIST. This is how plans are reached, replacing the Drafts tab inside the Builder.
 *
 * Slot one is RESERVED for the live team, permanently, and holds no players until the FPL API returns
 * picks. It is not a saved squad of blank shirts: before the first deadline there is genuinely no team,
 * and a placeholder fifteen would be an empty state dressed as data.
 */

const Card = ({ children, accent = T.line, onClick, as = "div" }) => {
  const style = {
    background: T.card, border: `1px solid ${accent}`, borderRadius: S.radius, padding: 18,
    display: "flex", flexDirection: "column", gap: 12, textAlign: "left", width: "100%",
    cursor: onClick ? "pointer" : "default",
  };
  if (as === "button") return <button onClick={onClick} className="fb-hover" style={style}>{children}</button>;
  return <div style={style}>{children}</div>;
};

/* Eleven shirts in formation order, so a plan is recognisable at a glance rather than by its name. */
function MiniShape({ players, captain, clubOf }) {
  const starting = players.filter((p) => p.starting);
  const use = starting.length ? starting : players.slice(0, 11);
  const lines = ["FWD", "MID", "DEF", "GKP"].map((pos) => use.filter((p) => p.position === pos));
  if (!use.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {lines.filter((l) => l.length).map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 5, justifyContent: "center" }}>
          {line.map((p) => (
            <span key={p.fpl_id} style={{ position: "relative", display: "flex" }}>
              <Kit team={clubOf ? clubOf(p.team_id) : p.team} size={20} />
              {captain === p.fpl_id && (
                <span style={{ position: "absolute", right: -3, bottom: -3, width: 11, height: 11, borderRadius: 6,
                  background: T.tag, border: `1px solid ${T.card}` }} />
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const Stat = ({ label, value, tone = "#FFFFFF" }) => (
  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 62 }}>
    <span style={code(13)}>{label}</span>
    <span style={val(15, tone)}>{value}</span>
  </span>
);

/* Slot one. Reserved, never fake. */
function LiveSlot({ live, entryId, onConnect, clubOf }) {
  const hasPicks = live && Array.isArray(live.base) && live.base.length > 0;
  return (
    <Card accent={hasPicks ? T.green : T.line}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <Label color={T.green}>Your team</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>{hasPicks ? live.name : `Team ${entryId}`}</h2>
        </div>
        <span style={val(13, "#FFFFFF", 500)}>SLOT 1</span>
      </div>

      {hasPicks ? (
        <>
          <MiniShape players={live.base} captain={live.captain} clubOf={clubOf} />
          <Link href={`/squad?plan=${live.id}`} style={{ textDecoration: "none" }}>
            <span className="fb-press" style={{ display: "inline-flex", alignItems: "center", height: S.btnSm,
              padding: "0 18px", borderRadius: 999, background: T.green, ...lang(14, 700, "#04130A") }}>
              OPEN
            </span>
          </Link>
        </>
      ) : (
        <>
          <span style={{ ...lang(14, 600), lineHeight: 1.5 }}>
            Loads automatically once the first deadline passes.
          </span>
          <button onClick={onConnect} className="fb-press"
            style={{ alignSelf: "flex-start", height: S.btnSm, padding: "0 18px", borderRadius: 999,
              background: T.card, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
            CHECK NOW
          </button>
        </>
      )}
    </Card>
  );
}

function PlanCard({ plan, priceOf, clubOf, onOpen, onActivate, onDelete }) {
  const shaped = { ...plan, base: plan.base || [], weeks: plan.weeks || {} };
  const gw1 = squadAt(shaped, 1);
  const check = validateAt(shaped, 1, priceOf);
  const weeks = Object.keys(shaped.weeks).map(Number).sort((a, b) => a - b);
  const lastGw = weeks.length ? weeks[weeks.length - 1] : 1;
  const hits = transferLedger(shaped, lastGw).reduce((a, r) => a + r.hit, 0);
  const spend = gw1.players.reduce((a, p) => a + Number(priceOf ? (priceOf(p.fpl_id) ?? p.price) : p.price), 0);

  return (
    <Card accent={plan.is_active ? T.green : T.line}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, ...lang(17, 700) }}>{plan.name}</h3>
        {plan.is_active && <span style={val(13, T.green, 500)}>ACTIVE</span>}
      </div>

      <MiniShape players={gw1.players} captain={gw1.captain} clubOf={clubOf} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Stat label="PICKED" value={`${gw1.players.length}/${PLAN_RULES.squadSize}`}
          tone={gw1.players.length === PLAN_RULES.squadSize ? T.green : "#FFFFFF"} />
        <Stat label="SPENT" value={spend.toFixed(1)} tone={spend > PLAN_RULES.budget ? T.pink : "#FFFFFF"} />
        <Stat label="WEEKS" value={weeks.length ? `1 to ${lastGw}` : "1"} />
        {hits > 0 && <Stat label="HITS" value={`-${hits}`} tone={T.pink} />}
      </div>

      {!check.ok && (
        <span style={{ ...lang(13, 600, T.pink), lineHeight: 1.45 }}>{check.errors[0]}</span>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onOpen(plan)} className="fb-press"
          style={{ height: 36, padding: "0 16px", borderRadius: 999, background: T.green, ...lang(13.5, 700, "#04130A") }}>
          OPEN
        </button>
        {!plan.is_active && (
          <button onClick={() => onActivate(plan)} className="fb-press"
            style={{ height: 36, padding: "0 14px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(13.5, 700) }}>
            MAKE ACTIVE
          </button>
        )}
        <button onClick={() => onDelete(plan)} className="fb-press"
          style={{ height: 36, padding: "0 14px", borderRadius: 999, background: "#3A0217", ...lang(13.5, 700, T.pink) }}>
          DELETE
        </button>
      </div>
    </Card>
  );
}

export default function PlanList({ live, plans, entryId, priceOf, clubOf, onOpen, onActivate, onDelete, onConnect, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {error && <span style={{ ...lang(14, 600, T.pink), lineHeight: 1.5 }}>{error}</span>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: S.gap, alignItems: "start" }}>
        <LiveSlot live={live} entryId={entryId} onConnect={onConnect} clubOf={clubOf} />
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} priceOf={priceOf} clubOf={clubOf} onOpen={onOpen} onActivate={onActivate} onDelete={onDelete} />
        ))}
        <Card accent={T.line}>
          <Label color={T.cyan}>New</Label>
          <h3 style={{ margin: "5px 0 0", ...lang(17, 700) }}>Build a plan</h3>
          <Link href="/builder" style={{ textDecoration: "none" }}>
            <span className="fb-press" style={{ display: "inline-flex", alignItems: "center", height: S.btnSm,
              padding: "0 18px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
              OPEN THE BUILDER
            </span>
          </Link>
        </Card>
      </div>
    </div>
  );
}
