"use client";
import React from "react";
import DEFENCES from "../../config/defences.json";
import { usePersistentState } from "../../lib/use-persistent-state.jsx";
import { T, S, Kit, lang, val } from "../../lib/ui";
import { Panel, PanelRow, Field, Segmented } from "../../components/Panel";
import ResultsRange from "../../components/ResultsRange";
import { useResultsRange } from "../../components/ResultsRange";
import { attackTable, playedGameweeks } from "../../lib/club-results.mjs";

/* ATTACKS. The mirror of the Defences page: the league's attacks best first by goals scored, over any range
   of played gameweeks, home, away or all. Goals, per game, form (last three) and one comparison: goals
   against what an average attack would have scored against the same opponents. That replaced a 0-100
   rating which blended four things (goals, opponents, venue and recency) and could not be checked against
   the goals beside it. Now goals = average + difference, every time. */
const MATCHES = Array.isArray(DEFENCES.matches) ? DEFENCES.matches : [];
const BOUNDS = playedGameweeks(MATCHES);

export default function AttacksClient() {
  const [view, setView] = usePersistentState("attacks.view", "overall");
  const [attackSort, setAttackSort] = usePersistentState("attacks.sort", "goals");
  const [attackBestFirst, setAttackBestFirst] = usePersistentState("attacks.best", true);
  const range = useResultsRange("attacks.range", BOUNDS);
  const sortKey = ["goals", "per_game", "form_last3", "vs_average"].includes(attackSort) ? attackSort : "goals";
  const attackRows = React.useMemo(() => {
    const tables = DEFENCES.attack || {};
    const list = BOUNDS
      ? attackTable(MATCHES, { from: range.from, to: range.to, venue: view, names: DEFENCES.team_names || {} })
      : (Array.isArray(tables[view]) && tables[view].length ? tables[view] : tables.overall || []);
    const dir = attackBestFirst ? -1 : 1;
    const num = (r, k) => (r[k] === null || r[k] === undefined ? (dir < 0 ? -Infinity : Infinity) : Number(r[k]));
    return [...list].sort((a, b) => (num(a, sortKey) - num(b, sortKey)) * dir || (num(b, "per_game") - num(a, "per_game")) * -dir || a.team.localeCompare(b.team));
  }, [view, sortKey, attackBestFirst, range.from, range.to]);
  return (
    <div className="zeus-defences" style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {/* ATTACKS. The mirror of the table above: who scores, best first, so the question "whose attack do I
          want my defenders to avoid, and whose forwards do I want?" is answered on the same page. */}
      <Panel label="Attacks" className="zeus-fixtures-panel">
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
        </PanelRow>
        <PanelRow ariaLabel="Attack view">
          <Field label="Sort attacks by" wide>
            <Segmented ariaLabel="Sort attacks by" value={sortKey} onChange={setAttackSort}
              options={[{ key: "goals", label: "Goals" }, { key: "per_game", label: "Per game" }, { key: "form_last3", label: "Form" }, { key: "vs_average", label: "vs average" }]} />
          </Field>
          <Field label="Order" wide>
            <Segmented ariaLabel="Attack order" value={attackBestFirst ? "best" : "worst"} onChange={(k) => setAttackBestFirst(k === "best")}
              options={[{ key: "best", label: "Best first" }, { key: "worst", label: "Worst first" }]} />
          </Field>
        </PanelRow>
      </Panel>
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.gapSm }}>
        <div className="zeus-defences-head zeus-attacks-head" style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 84px 84px 84px 96px", gap: S.gapSm, alignItems: "end", padding: "6px 10px" }}>
          <span style={lang(13, 700)}>#</span>
          <span style={lang(13, 700)}>Club</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Goals scored">Goals</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Goals scored per game">Per game</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Mean goals scored over the last three games in the range">Form</span>
          <span style={{ ...lang(13, 700), textAlign: "center" }} title="Goals minus what an average attack would have scored against the same opponents">vs average</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs }}>
          {attackRows.map((r, i) => {
            const best = i < 5, worst = i >= attackRows.length - 5;
            const tone = (attackBestFirst ? best : worst) ? "#00E35F" : (attackBestFirst ? worst : best) ? "#FF2E58" : "#FFFFFF";
            const diff = Number(r.vs_average);
            const diffTone = !Number.isFinite(diff) ? "#FFFFFF" : diff >= 1 ? "#00E35F" : diff <= -1 ? "#FF2E58" : "#FFFFFF";
            return (
              <div key={r.team} className="zeus-defences-row zeus-attacks-row" style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 84px 84px 84px 96px", gap: S.gapSm, alignItems: "center",
                minHeight: 56, padding: "6px 10px", borderRadius: S.radiusSm, background: T.row, borderLeft: `4px solid ${tone}` }}>
                <span style={val(22, "#FFFFFF", 700)}>{i + 1}</span>
                <span style={{ display: "flex", alignItems: "center", gap: S.gapSm, minWidth: 0 }}>
                  {r.code && <Kit team={r.code} size={26} />}
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.15 }}>
                    <span className="zeus-def-name" style={{ ...lang(16, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.team}</span>
                    <span className="zeus-def-code" style={{ ...lang(16, 700), display: "none" }}>{r.code || r.team}</span>
                    <span className="zeus-def-games" style={{ ...lang(12.5, 600), whiteSpace: "nowrap" }}>{r.games} games</span>
                  </span>
                </span>
                <span style={{ ...val(24, tone, 700), textAlign: "center" }}>{r.goals}</span>
                <span style={{ ...val(18, "#FFFFFF", 700), textAlign: "center" }}>{Number(r.per_game).toFixed(2)}</span>
                <span style={{ ...val(18, "#FFFFFF", 700), textAlign: "center" }}>{Number(r.form_last3).toFixed(1)}</span>
                {/* Goals = average + difference: the small line says what an average attack would have scored
                    against these opponents, the big figure is how far above or below that this club is. */}
                <span title={Number.isFinite(diff) ? `${r.goals} scored. An average attack would have scored ${Number(r.average).toFixed(1)} against these opponents.` : undefined}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
                  <span style={val(18, diffTone, 700)}>{Number.isFinite(diff) ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}` : "–"}</span>
                  {Number.isFinite(Number(r.average)) && <span className="zeus-def-games" style={{ ...lang(12, 600), whiteSpace: "nowrap" }}>avg {Number(r.average).toFixed(1)}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: S.gapMd, flexWrap: "wrap", padding: "10px 10px 2px", ...lang(13, 600) }}>
          <span>{attackBestFirst ? "Best attack first, by goals scored." : "Worst attack first."}</span>
          <span>Form: goals per game over the last three. vs average: goals minus what an average attack would have scored against the same opponents (their season record), so 24 scored against an average of 12.6 is +11.4.</span>
          {BOUNDS && <span style={{ marginLeft: "auto" }}>Official FPL results, GW{range.from}{range.to !== range.from ? `-GW${range.to}` : ""}</span>}
        </div>
      </section>
    </div>
  );
}
