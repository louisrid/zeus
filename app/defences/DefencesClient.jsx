"use client";
import React from "react";
import DEFENCES from "../../config/defences.json";
import { usePersistentState } from "../../lib/use-persistent-state.jsx";
import { T, S, Kit, lang, val } from "../../lib/ui";
import { Panel, PanelRow, Field, Segmented } from "../../components/Panel";
import ResultsRange from "../../components/ResultsRange";
import { useResultsRange } from "../../components/ResultsRange";
import { defenceTable, playedGameweeks } from "../../lib/club-results.mjs";

/* DEFENCES. The league's defences from worst to best: most goals conceded at the top, because the
   question this page answers is "whose defence do I attack?". Overall, home or away, over any range of
   played gameweeks. Built from the official results stored with every data update; Sports Mole's
   season table is the fallback if the match list is missing. */
const MATCHES = Array.isArray(DEFENCES.matches) ? DEFENCES.matches : [];
const BOUNDS = playedGameweeks(MATCHES);

const ago = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const h = Math.round(ms / 3600000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function DefencesClient() {
  const [view, setView] = usePersistentState("defences.view", "overall");
  /* "read 3h ago" depends on the clock, so it is filled in after mount; rendering it on the server gave
     a different string from the browser's first paint and React logged a mismatch. */
  const [readAgo, setReadAgo] = React.useState("");
  React.useEffect(() => { setReadAgo(DEFENCES.captured ? `, read ${ago(DEFENCES.captured)}` : ""); }, []);
  const [sortKey, setSortKey] = usePersistentState("defences.sort", "goals_against");
  const [worstFirst, setWorstFirst] = usePersistentState("defences.worst", true);
  const range = useResultsRange("defences.range", BOUNDS);
  const SORTS = [
    { key: "goals_against", label: "Conceded" }, { key: "avg_per_game", label: "Per game" },
    { key: "clean_sheets", label: "Clean sheets" },
  ];
  const rows = React.useMemo(() => {
    const list = BOUNDS
      ? defenceTable(MATCHES, { from: range.from, to: range.to, venue: view, names: DEFENCES.team_names || {} })
      : (Array.isArray(DEFENCES[view]) && DEFENCES[view].length ? DEFENCES[view] : DEFENCES.overall || []);
    /* "Worst first" means most conceded, highest per game, fewest clean sheets. */
    const key = SORTS.some((o) => o.key === sortKey) ? sortKey : "goals_against";
    const higherIsBetter = key === "clean_sheets";
    const dir = higherIsBetter === worstFirst ? 1 : -1;
    const num = (r, k) => (r[k] === null || r[k] === undefined ? null : Number(r[k]));
    const primary = (r) => { const v = num(r, key); return v === null ? (dir > 0 ? Infinity : -Infinity) : v; };
    /* Ties break on the other plain figures: more conceded per game is worse, fewer clean sheets is worse. */
    const tie = (a, b) => ((num(b, "avg_per_game") - num(a, "avg_per_game")) || (num(a, "clean_sheets") - num(b, "clean_sheets"))) * (worstFirst ? 1 : -1);
    return [...list].sort((a, b) => (primary(a) - primary(b)) * dir || tie(a, b) || a.team.localeCompare(b.team));
  }, [view, sortKey, worstFirst, range.from, range.to]);
  const games = (r) => (Number.isFinite(Number(r.games)) ? Number(r.games) : r.avg_per_game > 0 ? Math.round(r.goals_against / r.avg_per_game) : null);

  return (
    <div className="zeus-defences" style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Panel label="Defences" className="zeus-fixtures-panel">
        {BOUNDS && (
          <PanelRow ariaLabel="Gameweeks">
            <ResultsRange bounds={BOUNDS} from={range.from} to={range.to} onChange={range.setRange} />
          </PanelRow>
        )}
        <PanelRow ariaLabel="View">
          <Field label="Games" wide>
            <Segmented ariaLabel="Which games" value={view} onChange={setView}
              options={[{ key: "overall", label: "All" }, { key: "home", label: "Home" }, { key: "away", label: "Away" }]} />
          </Field>
          <Field label="Sort by" wide>
            <Segmented ariaLabel="Sort by" value={sortKey} onChange={setSortKey} options={SORTS} />
          </Field>
          <Field label="Order" wide>
            <Segmented ariaLabel="Order" value={worstFirst ? "worst" : "best"} onChange={(k) => setWorstFirst(k === "worst")}
              options={[{ key: "worst", label: "Worst first" }, { key: "best", label: "Best first" }]} />
          </Field>
        </PanelRow>
      </Panel>

      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.gapSm }}>
        <div className="zeus-defences-head" style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 84px 84px 84px", gap: S.gapSm, alignItems: "end", padding: "6px 10px" }}>
          <span style={lang(13, 700)}>#</span>
          <span style={lang(13, 700)}>Club</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Goals conceded">Conceded</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Goals conceded per game">Per game</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Clean sheets">Clean sheets</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs }}>
          {rows.map((r, i) => {
            const worst = i < 5, best = i >= rows.length - 5;
            const tone = worst ? "#FF2E58" : best ? "#00E35F" : "#FFFFFF";
            return (
              <div key={r.team} className="zeus-defences-row" style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 84px 84px 84px", gap: S.gapSm, alignItems: "center",
                minHeight: 56, padding: "6px 10px", borderRadius: S.radiusSm, background: T.row, borderLeft: `4px solid ${tone}` }}>
                <span style={val(22, "#FFFFFF", 700)}>{i + 1}</span>
                <span style={{ display: "flex", alignItems: "center", gap: S.gapSm, minWidth: 0 }}>
                  {r.code && <Kit team={r.code} size={26} />}
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.15 }}>
                    <span className="zeus-def-name" style={{ ...lang(16, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.team}</span>
                    <span className="zeus-def-code" style={{ ...lang(16, 700), display: "none" }}>{r.code || r.team}</span>
                    {games(r) ? <span className="zeus-def-games" style={{ ...lang(12.5, 600), whiteSpace: "nowrap" }}>{games(r)} games</span> : null}
                  </span>
                </span>
                <span style={{ ...val(24, tone, 700), textAlign: "center" }}>{r.goals_against}</span>
                <span style={{ ...val(18, "#FFFFFF", 700), textAlign: "center" }}>{Number(r.avg_per_game).toFixed(2)}</span>
                <span style={{ ...val(18, "#FFFFFF", 700), textAlign: "center" }}>{r.clean_sheets}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: S.gapMd, flexWrap: "wrap", padding: "10px 10px 2px", ...lang(13, 600) }}>
          <span>{worstFirst ? "Worst defence first." : "Best defence first."}</span>

          <span style={{ display: "flex", alignItems: "center", gap: S.gapXs }}><span style={{ width: 12, height: 12, borderRadius: S.radiusXs, background: "#FF2E58", display: "inline-block" }} />Five leakiest</span>
          <span style={{ display: "flex", alignItems: "center", gap: S.gapXs }}><span style={{ width: 12, height: 12, borderRadius: S.radiusXs, background: "#00E35F", display: "inline-block" }} />Five tightest</span>
          <span style={{ marginLeft: "auto" }}>
            {BOUNDS ? <>Official FPL results, GW{range.from}{range.to !== range.from ? `-GW${range.to}` : ""}{readAgo}</>
              : <>Source: <a href={DEFENCES.source_url} target="_blank" rel="noreferrer" style={{ color: T.green, display: "inline-block", padding: "10px 4px", margin: "-10px -4px" }}>{DEFENCES.source}</a>{readAgo}</>}
          </span>
        </div>
      </section>

    </div>
  );
}
