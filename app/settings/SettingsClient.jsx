"use client";
import React from "react";
import { T, S, lang } from "../../lib/ui";
import { Panel, PanelRow, Field, Segmented } from "../../components/Panel";
import { XPTS_SOURCES, clientXptsSource, setClientXptsSource } from "../../lib/xpts-source.mjs";
import BLEND from "../../config/blend-xpts-2026-27.mjs";

/* SETTINGS. Choices that change the whole site. For now one: which expected points every page and every
   build uses. Stored per browser; the page reloads so everything already loaded is recalculated. */
export default function SettingsClient() {
  const [source, setSource] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { setSource(clientXptsSource()); }, []);
  /* Coverage read from the last import, so the wording is true even when a source was missing. */
  const cov = BLEND?.coverage || {};
  const sq = cov.sideline?.gameweek ? Number(cov.sideline.gameweek) : null;
  const go = Array.isArray(cov.fplgo?.gameweeks) && cov.fplgo.gameweeks.length ? cov.fplgo.gameweeks.map(Number) : [];
  const lines = [];
  if (sq) lines.push(`GW${sq}: Sideline Quant, ${go.includes(sq) ? "FPL GO and " : ""}FPL Copilot`);
  const goOnly = go.filter((g) => g !== sq);
  if (goOnly.length) lines.push(`GW${goOnly[0]}${goOnly.length > 1 ? `-${goOnly[goOnly.length - 1]}` : ""}: FPL GO and FPL Copilot`);
  const last = Math.max(sq || 0, ...go, 0);
  lines.push(last ? `GW${last + 1} on: FPL Copilot only` : "FPL Copilot only, until the other sources are read");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Panel label="Projections">
        <PanelRow ariaLabel="Projections">
          <Field label="Expected points" wide>
            <Segmented ariaLabel="Which projections to use" value={source || ""} disabled={source === null}
              onChange={async (key) => {
                if (key === source) return;
                setSource(key); setError(null);
                try { await setClientXptsSource(key); window.location.reload(); }
                catch (e) { setError(e.message); setSource(clientXptsSource()); }
              }}
              options={XPTS_SOURCES.map((s) => ({ key: s.key, label: s.label }))} />
          </Field>
        </PanelRow>
        <div style={{ ...lang(14, 600), display: "flex", flexDirection: "column", gap: S.gapSm, padding: "4px 2px 2px" }}>
          <span><strong>Mean of 3</strong> averages the sources that cover each gameweek. A source that does not cover a week is left out, never counted as zero.</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>{lines.map((line) => <span key={line}>{line}</span>)}</span>
          <span><strong>FPL Copilot</strong> uses Copilot on its own.</span>
          <span>This applies to every page and every build in this browser.</span>
          {error && <span style={{ color: T.pink }}>{error}</span>}
          <span>Sideline Quant data under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" style={{ color: T.green }}>CC BY 4.0</a>, <a href="https://sidelinequant.com" target="_blank" rel="noreferrer" style={{ color: T.green }}>sidelinequant.com</a>.</span>
        </div>
      </Panel>
    </div>
  );
}
