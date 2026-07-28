"use client";
import React from "react";
import { nextFixtures } from "../lib/data";
import { T, S, Kit, Label, lang, val, code } from "../lib/ui";
import Opp from "./Opp";

/* FIXTURE OUTLOOK: the ten best runs on the left, the ten worst on the right, over the same gameweeks.
 *
 * Three views, because one number cannot answer all three questions:
 *   OVERALL  how hard the fixtures are, from the shared difficulty scale
 *   ATTACK   how favourable they are for attacking players, from the opponents' DEFENSIVE rating
 *   DEFENCE  how favourable they are for defensive players, from the opponents' ATTACKING rating
 *
 * FPL publishes attack and defence ratings per club and per venue. Where they are present they are used
 * directly. Where they are not, the honest proxies available are used instead: overall club strength for
 * the attacking view, since a weak club is easier to score against, and attacking xG for the defensive
 * view, since a club that creates little is easier to keep out. Both are real signals rather than a copy
 * of the overall number, and the basis in use is stated on screen.
 */

const VIEWS = [
  { key: "OVERALL", label: "OVERALL" },
  { key: "ATTACK", label: "ATTACK" },
  { key: "DEFENCE", label: "DEFENCE" },
];

export default function FixtureOutlook({ core, scale, gameweeks = 5 }) {
  const [view, setView] = React.useState("OVERALL");

  const clubs = React.useMemo(() => Object.values(core.teamById || {}), [core]);

  /* Normalise whichever rating the view needs across the league, so every club is scored on one scale. */
  /* What each view measures, using data that is always present.
   *
   * OVERALL  the shared difficulty scale, which is coverage-based and never empty.
   * ATTACK   how easy the opponents are to score against. Their defensive rating where FPL has published
   *          one, otherwise their overall strength, since a weaker club concedes more.
   * DEFENCE  how easy the opponents are to keep out. Their attacking rating where published, otherwise
   *          their attacking xG, since a club that creates little is easier to shut out.
   *
   * Every basis is normalised across the league, so a club is always ranked against its peers on one
   * scale rather than on whichever field happened to exist. */
  const ratings = React.useMemo(() => {
    const read = (t, kind, home) => {
      if (kind === "ATTACK") {
        const v = home ? t.strength_defence_home : t.strength_defence_away;
        if (v !== null && v !== undefined) return Number(v);
        return t.strength !== null && t.strength !== undefined ? Number(t.strength) : null;
      }
      const v = home ? t.strength_attack_home : t.strength_attack_away;
      if (v !== null && v !== undefined) return Number(v);
      if (t.xg_for !== null && t.xg_for !== undefined) return Number(t.xg_for);
      return t.strength !== null && t.strength !== undefined ? Number(t.strength) : null;
    };
    const range = (kind) => {
      const vals = clubs.flatMap((t) => [read(t, kind, true), read(t, kind, false)])
        .filter((v) => v !== null && Number.isFinite(v));
      if (!vals.length) return null;
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return hi === lo ? null : [lo, hi];
    };
    return { read, ATTACK: range("ATTACK"), DEFENCE: range("DEFENCE") };
  }, [clubs]);

  const rows = React.useMemo(() => {
    const out = [];
    for (const club of clubs) {
      const fx = nextFixtures(core.fixtures, core.teamById, club.id, gameweeks);
      if (fx.length < 2) continue;
      const scores = [];
      for (const f of fx) {
        if (view === "OVERALL") {
          const d = scale ? scale.difficultyOf(f.oppId, f.home) : null;
          if (d) scores.push(d.difficulty);
          continue;
        }
        const opp = core.teamById[f.oppId];
        const r = ratings[view];
        if (!opp || !r) continue;
        // The opponent plays the opposite venue to this club.
        const raw = ratings.read(opp, view, !f.home);
        if (raw === null || !Number.isFinite(Number(raw))) continue;
        const [lo, hi] = r;
        // 0 is the easiest opponent for this purpose, 100 the hardest.
        scores.push(hi === lo ? 50 : ((Number(raw) - lo) / (hi - lo)) * 100);
      }
      if (scores.length < 2) continue;
      out.push({ club, fx, score: scores.reduce((a, b) => a + b, 0) / scores.length });
    }
    return out.sort((a, b) => a.score - b.score);
  }, [clubs, core, scale, view, gameweeks, ratings]);

  const best = rows.slice(0, 10);
  const worst = [...rows].reverse().slice(0, 10);

  const Side = ({ title, colour, list }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <Label color={colour}>{title}</Label>
      {list.length === 0 && <span style={lang(13.5, 500)}>Fixtures not published yet.</span>}
      {list.map(({ club, fx }, i) => (
        <div key={club.id} style={{ display: "grid", gridTemplateColumns: "26px 24px minmax(0,1fr) auto",
          gap: 10, alignItems: "center", height: 44, padding: "0 12px",
          borderRadius: S.radiusSm, background: T.row }}>
          <span style={val(13, "#FFFFFF", 500)}>{i + 1}</span>
          <Kit team={club.short_name} size={20} />
          <span style={{ ...lang(14, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {club.short_name}
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            {fx.slice(0, gameweeks).map((f, k) => <Opp key={k} fx={f} scale={scale} size="sm" showNumber={false} />)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className="fb-press"
            style={{ height: 42, padding: "0 18px", borderRadius: S.radiusSm,
              background: view === v.key ? T.green : T.card,
              border: view === v.key ? "none" : `1px solid ${T.line}`,
              ...lang(14, 700, view === v.key ? "#04130A" : "#FFFFFF") }}>
            {v.label}
          </button>
        ))}
        <span style={{ ...code(13), marginLeft: 6 }}>NEXT {gameweeks} GAMEWEEKS</span>
        {view !== "OVERALL" && !ratings[view] && (
          <span style={{ ...lang(13, 500, T.pink) }}>
            Not enough club data for this view yet.
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: S.gap }}>
        <Side title="Best fixtures" colour={T.green} list={best} />
        <Side title="Worst fixtures" colour={T.pink} list={worst} />
      </div>
    </div>
  );
}
