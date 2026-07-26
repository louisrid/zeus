"use client";
import React from "react";
import { Link2, Unlink, Check } from "lucide-react";
import { blanksAndDoubles } from "../lib/data";
import { T, S, Label, Plate, Value, lang, val, code } from "../lib/ui";

/* TEAM ID CONNECT — DECISIONS 8.3.
   Picks only exist once a gameweek has started, so before GW1 this stores the entry and says so
   rather than showing an empty squad. Nothing is invented. */
export const MY_ENTRY_ID = "4812";

export function TeamConnect() {
  const [entry, setEntry] = React.useState(null);
  const [snapshots, setSnapshots] = React.useState(null);
  const [id, setId] = React.useState(MY_ENTRY_ID);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(() => {
    fetch("/api/entry")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error); return; }
        setSnapshots(j.snapshots);
        if (j.snapshots.length) setEntry({ id: j.snapshots[0].entry_id, gw: j.snapshots[0].gw, bank: j.snapshots[0].bank, teamValue: j.snapshots[0].team_value, hasPicks: Boolean(j.snapshots[0].picks) });
      })
      .catch(() => setError("Team tracking is unavailable."));
  }, []);
  React.useEffect(load, [load]);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await fetch("/api/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: id }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error);
      setEntry(j.entry); setError(null);
      setMsg(j.entry.hasPicks ? `Connected. Picks captured for GW${j.entry.gw}.` : "Connected. No picks exist before GW1.");
      load();
    } catch (e) { setMsg(e.message || "Could not connect."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
      setEntry(null); setSnapshots([]); setMsg("Disconnected.");
    } finally { setBusy(false); }
  };

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={error ? T.pink : T.green}>{error ? "Tracking unavailable" : "Your team"}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>
          {entry ? `Connected to ${entry.id}` : "Connect your team ID"}
        </h2>
      </div>

      {error ? (
        <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>
          {error} The server route is missing its database credentials in the Vercel project environment.
        </p>
      ) : entry ? (
        <>
          <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
            {entry.name && (
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Team</span><span style={lang(18, 700)}>{entry.name}</span>
              </span>
            )}
            {entry.overallRank !== null && entry.overallRank !== undefined && (
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Overall rank</span>
                <span style={val(20)}>{Number(entry.overallRank).toLocaleString("en-GB")}</span>
              </span>
            )}
            {entry.teamValue !== null && entry.teamValue !== undefined && (
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Team value</span><span style={val(20)}>{Number(entry.teamValue).toFixed(1)}</span>
              </span>
            )}
            {entry.bank !== null && entry.bank !== undefined && (
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Bank</span><span style={val(20)}>{Number(entry.bank).toFixed(1)}</span>
              </span>
            )}
          </div>
          {!entry.hasPicks && (
            <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0 }}>
              No picks stored yet. The official API only publishes a squad once a gameweek has started,
              so these appear after the GW1 deadline and then update every capture.
            </p>
          )}
          {snapshots && snapshots.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {snapshots.map((s) => (
                <div key={s.gw} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: 8, alignItems: "center",
                  padding: "0 12px", height: 42, borderRadius: S.radiusSm, background: T.row }}>
                  <span style={code(13)}>GW{s.gw}</span>
                  <Value>{s.picks ? `${(s.picks.picks || []).length} picks` : "No picks"}</Value>
                  <Value>{s.team_value === null ? "Not stored" : Number(s.team_value).toFixed(1)}</Value>
                  <Value>{s.chip ? s.chip.replace(/_/g, " ") : "No chip"}</Value>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 14px", borderRadius: 999,
              background: "rgba(0,255,133,0.12)", border: `1px solid ${T.green}` }}>
              <Check size={14} color={T.green} />
              <span style={lang(14, 700, T.green)}>Live team on</span>
            </span>
            <button onClick={connect} disabled={busy} className="fb-press"
              style={{ display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 18px", borderRadius: 999,
                background: T.row, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
              Refresh now
            </button>
            <button onClick={disconnect} disabled={busy} className="fb-press"
              style={{ display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 18px",
                borderRadius: 999, background: T.row, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
              <Unlink size={14} /> Turn off
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>
            Turning this on pulls your real squad from the official API so every projection is settled
            against what you actually picked, rather than against a draft.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={connect} disabled={busy || !id} className="fb-press"
              style={{ display: "flex", alignItems: "center", gap: 9, height: S.btn, padding: "0 22px", borderRadius: 999,
                background: T.green, ...lang(15, 700, "#04130A"), opacity: busy || !id ? 0.5 : 1 }}>
              <Link2 size={15} /> {busy ? "Turning on" : "Use my live team"}
            </button>
            <span style={{ display: "flex", alignItems: "center", gap: 8, height: S.btn, padding: "0 14px", borderRadius: 12,
              background: T.row, border: `1px solid ${T.line}` }}>
              <span style={lang(13.5, 600)}>Team ID</span>
              <input value={id} onChange={(e) => setId(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Team ID"
                style={{ width: 74, background: "transparent", border: "none", outline: "none", textAlign: "center", ...val(15) }} />
            </span>
          </div>
        </>
      )}
      {msg && <span style={val(13, "#FFFFFF", 500)}>{msg}</span>}
    </section>
  );
}

/* CHIP PLANNING — DECISIONS 8.4.
   Two sets of chips across the season. Fixture-run difficulty is shown per gameweek as the evidence
   for a choice; blank and double gameweeks are NOT shown, because nothing ingested detects them yet
   and guessing them would be an invented number. */
const CHIPS = [
  { key: "wildcard", name: "Wildcard", why: "Rebuild the squad without transfer cost." },
  { key: "bench_boost", name: "Bench Boost", why: "All fifteen score. Wants a gameweek where the bench actually plays." },
  { key: "triple_captain", name: "Triple Captain", why: "The armband trebles. Wants one fixture far easier than the rest." },
  { key: "free_hit", name: "Free Hit", why: "One gameweek only, then the squad reverts." },
];

export function ChipPlanner({ runByGw, core }) {
  const [plan, setPlan] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/chips").then((r) => r.json()).then((j) => {
      if (!j.ok) { setError(j.error); return; }
      setPlan(j.plan); setError(null);
    }).catch(() => setError("Chip planning is unavailable."));
  }, []);
  React.useEffect(load, [load]);

  const set = async (chipSet, chip, plannedGw) => {
    setBusy(true);
    try {
      await fetch("/api/chips", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chipSet, chip, plannedGw, status: "skeleton" }) });
      load();
    } finally { setBusy(false); }
  };

  const current = (chipSet, chip) => {
    const row = (plan || []).find((p) => p.chip_set === chipSet && p.chip === chip);
    return row ? row.planned_gw : "";
  };

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={error ? T.pink : T.green}>{error ? "Chips unavailable" : "Chips"}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>Plan the season</h2>
      </div>

      {error ? (
        <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>
          {error} The server route is missing its database credentials in the Vercel project environment.
        </p>
      ) : (
        <>
          {[1, 2].map((chipSet) => (
            <div key={chipSet} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={code(13)}>{chipSet === 1 ? "FIRST HALF" : "SECOND HALF"}</span>
              {CHIPS.map((c) => (
                <div key={c.key} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 110px minmax(180px,1.6fr)", gap: 12,
                  alignItems: "center", padding: "10px 14px", borderRadius: S.radiusSm, background: T.row }}>
                  <span style={lang(15, 700)}>{c.name}</span>
                  <input value={current(chipSet, c.key)} disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      set(chipSet, c.key, v === "" ? null : Number(v));
                    }}
                    placeholder="GW"
                    style={{ height: 38, padding: "0 12px", borderRadius: 10, background: T.plate, border: `1px solid ${T.line}`,
                      outline: "none", textAlign: "center", ...val(14.5) }} />
                  <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{c.why}</span>
                </div>
              ))}
            </div>
          ))}
          {(() => {
            const irregular = core ? blanksAndDoubles(core.fixtures, core.teams.map((t) => t.id)) : [];
            if (!irregular.length) return (
              <span style={{ ...lang(13.5, 600) }}>No blank or double gameweeks in the published fixtures yet.</span>
            );
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={code(13)}>BLANKS AND DOUBLES</span>
                {irregular.map((r) => (
                  <span key={r.gw} style={{ ...lang(14, 600), lineHeight: 1.5 }}>
                    GW{r.gw}: {r.doubles.length ? `${r.doubles.map((t) => (core.teamById[t] || {}).short_name || t).join(", ")} play twice` : ""}
                    {r.doubles.length && r.blanks.length ? " · " : ""}
                    {r.blanks.length ? `${r.blanks.map((t) => (core.teamById[t] || {}).short_name || t).join(", ")} blank` : ""}
                  </span>
                ))}
              </div>
            );
          })()}
          {runByGw && runByGw.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={code(13)}>MEAN FIXTURE DIFFICULTY BY GAMEWEEK</span>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {runByGw.map((r) => (
                  <span key={r.gw} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    background: T.plate, borderRadius: 9, padding: "7px 9px", minWidth: 52 }}>
                    <span style={lang(13, 700)}>GW{r.gw}</span>
                    <span style={val(13.5, r.tone)}>{r.difficulty}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>
            Blank and double gameweeks are not shown. Nothing ingested detects them yet, and guessing
            which fixtures will be postponed or rearranged would be an invented number.
          </p>
        </>
      )}
    </section>
  );
}
