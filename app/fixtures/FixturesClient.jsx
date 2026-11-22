"use client";
import React from "react";
import Link from "next/link";
import FDR from "../../config/fdr-2026-27.mjs";
import DEFENCES from "../../config/defences.json";
import { usePersistentState } from "../../lib/use-persistent-state.jsx";
import { sb, loadCore } from "../../lib/data";
import { T, S, Kit, lang, val } from "../../lib/ui";
import { Panel, PanelRow, Field, Select, Segmented, Button } from "../../components/Panel";

/* FIXTURES. Every club's run of games over a range of gameweeks, coloured by how hard each one is, sorted
   so the easiest runs rise to the top. Two ways to rate a fixture: FPL's official 1 to 5, or the opponent's
   strength relative to the club's own, which makes a good side's hard game and a weak side's hard game
   comparable. Blanks show as a dash and count for nothing; doubles show both games and count both. */

const CLUBS = Object.keys(FDR.clubs || {}).sort();
const ALL_GWS = [...new Set(Object.values(FDR.clubs || {}).flatMap((c) => Object.keys(c).map(Number)))].sort((a, b) => a - b);
const LAST_GW = ALL_GWS.length ? ALL_GWS[ALL_GWS.length - 1] : 38;

/* TEAM STRENGTH, FROM RESULTS. Each club's attack rating and defence rating (0-100, 50 average) come from
   the same data as the Defences page: goals scored and conceded measured against the strength of every
   opponent faced, home or away adjusted, with the last three games counting double. They move with every
   data update. Strength is the average of the two.

   A FIXTURE SCORE for a club is how good that game is for them, 0-100 with 50 even: half the strength gap
   between the two sides, plus the home advantage. Home advantage is worth 8 points of strength, about a
   quarter of the spread between the best and worst sides: enough that a mid-table side at home edges a
   slightly better side away, not enough to send a poor side above a strong one. */
const strengthOf = (() => {
  const att = new Map(((DEFENCES.attack && DEFENCES.attack.overall) || []).map((r) => [r.code, Number(r.rating)]));
  const def = new Map((DEFENCES.overall || []).map((r) => [r.code, Number(r.rating)]));
  return (code) => {
    const a = att.has(code) ? att.get(code) : 50, d = def.has(code) ? def.get(code) : 50;
    return { attack: a, defence: d, strength: Math.round((a + d) / 2) };
  };
})();
const HOME_EDGE = 8;
function fixtureScore(club, entry) {
  const me = strengthOf(club).strength + (entry.at === "H" ? HOME_EDGE : 0);
  const them = strengthOf(entry.opponent).strength + (entry.at === "A" ? HOME_EDGE : 0);
  const gap = me - them;
  return { score: Math.max(0, Math.min(100, Math.round(50 + gap / 2))), gap, me, them };
}
/* Three colours only: green when the fixture favours the club, grey when even, red when it favours the
   opponent. */
const EASY = ["#00E35F", "#000000"], MID = ["#C9C9D6", "#000000"], HARD = ["#FF2E58", "#000000"];
const colours = (score) => (score >= 58 ? EASY : score <= 42 ? HARD : MID);

export default function FixturesClient() {
  const [gwFrom, setGwFrom] = usePersistentState("fixtures.from", null);
  const [gwTo, setGwTo] = usePersistentState("fixtures.to", null);
  const [sort, setSort] = usePersistentState("fixtures.sort", "easiest");
  const [venue, setVenue] = usePersistentState("fixtures.venue", "both");
  const [pinned, setPinned] = usePersistentState("fixtures.pinned", []);
  const [myClubs, setMyClubs] = React.useState([]);
  const [showMine, setShowMine] = usePersistentState("fixtures.mine", false);

  const [currentGw, setCurrentGw] = React.useState(null);
  React.useEffect(() => {
    /* The next deadline decides the first gameweek shown, exactly as the header's countdown does. */
    sb().from("gameweeks").select("gw, deadline_utc, finished").order("gw").limit(40)
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const upcoming = rows.filter((row) => row && row.deadline_utc && new Date(row.deadline_utc).getTime() > Date.now())
          .sort((a, b) => new Date(a.deadline_utc) - new Date(b.deadline_utc));
        const next = upcoming[0] || rows.filter((row) => row && !row.finished).sort((a, b) => Number(a.gw) - Number(b.gw))[0] || null;
        if (next) setCurrentGw(Number(next.gw));
      }).catch(() => {});
    /* The clubs in your official team, to highlight with one tap. The team sits on each player as an id,
       so it is read through the player list. */
    Promise.all([fetch("/api/plans").then((r) => r.json()), loadCore()]).then(([j, core]) => {
      const base = j && j.ok && j.live && Array.isArray(j.live.base) ? j.live.base : [];
      const byId = new Map((core.players || []).map((p) => [Number(p.fpl_id), p.team]));
      setMyClubs([...new Set(base.map((p) => byId.get(Number(p.fpl_id)) || p.team).filter(Boolean))]);
    }).catch(() => {});
  }, []);

  const from = gwFrom || currentGw || 1;
  const to = gwTo || Math.min(from + 5, LAST_GW);
  const gws = [];
  for (let gw = from; gw <= Math.max(from, to); gw += 1) gws.push(gw);

  const rows = React.useMemo(() => CLUBS.map((club) => {
    const byGw = FDR.clubs[club] || {};
    const cells = gws.map((gw) => (byGw[gw] || byGw[String(gw)] || []).filter((e) => venue === "both" || (venue === "home" ? e.at === "H" : e.at === "A")));
    const games = cells.flat();
    const total = games.reduce((sum, e) => sum + fixtureScore(club, e).score, 0);
    const avg = games.length ? total / games.length : null;
    return { club, cells, games: games.length, blanks: cells.filter((c) => !c.length).length, doubles: cells.filter((c) => c.length > 1).length, total, avg, strength: strengthOf(club) };
  }), [gws.join(","), venue]);

  const sorted = React.useMemo(() => {
    const list = [...rows];
    if (sort === "easiest") list.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.games - a.games || a.club.localeCompare(b.club));
    else if (sort === "hardest") list.sort((a, b) => (a.avg ?? 101) - (b.avg ?? 101) || a.club.localeCompare(b.club));
    else list.sort((a, b) => a.club.localeCompare(b.club));
    return list;
  }, [rows, sort]);

  const togglePin = (club) => setPinned((list) => (list.includes(club) ? list.filter((c) => c !== club) : [...list, club]));
  const highlighted = (club) => pinned.includes(club) || (showMine && myClubs.includes(club));
  const gwOptions = ALL_GWS.filter((gw) => !currentGw || gw >= currentGw - 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Panel label="Fixtures" className="zeus-fixtures-panel">
        <PanelRow ariaLabel="Range">
          <Field label="Gameweeks" wide>
            <div style={{ display: "flex", alignItems: "center", gap: S.gapSm }}>
              <Select aria-label="From gameweek" style={{ minWidth: 96 }} value={from} onChange={(e) => { const v = Number(e.target.value); setGwFrom(v); if (to < v) setGwTo(v); }}>
                {gwOptions.map((gw) => <option key={gw} value={gw}>GW{gw}</option>)}
              </Select>
              <span style={lang(13, 600)}>to</span>
              <Select aria-label="To gameweek" style={{ minWidth: 96 }} value={to} onChange={(e) => setGwTo(Math.max(from, Number(e.target.value)))}>
                {gwOptions.filter((gw) => gw >= from).map((gw) => <option key={gw} value={gw}>GW{gw}</option>)}
              </Select>
            </div>
          </Field>
          <Field label="Next" wide>
            <Segmented ariaLabel="Quick range" value={String(to - from + 1)} onChange={(n) => { setGwFrom(from); setGwTo(Math.min(from + Number(n) - 1, LAST_GW)); }}
              options={[{ key: "3", label: "3" }, { key: "5", label: "5" }, { key: "8", label: "8" }, { key: "12", label: "12" }]} />
          </Field>
        </PanelRow>
        <PanelRow ariaLabel="Options">
          <Field label="Sort" wide>
            <Segmented ariaLabel="Sort" value={sort} onChange={setSort}
              options={[{ key: "easiest", label: "Easiest" }, { key: "hardest", label: "Hardest" }, { key: "club", label: "A to Z" }]} />
          </Field>
          <Field label="Venue" wide>
            <Segmented ariaLabel="Venue" value={venue} onChange={setVenue}
              options={[{ key: "both", label: "All" }, { key: "home", label: "Home" }, { key: "away", label: "Away" }]} />
          </Field>
          <Field label="Highlight" wide>
            <div style={{ display: "flex", gap: S.gapSm, flexWrap: "wrap" }}>
              <Button tone={showMine ? "blue" : "white"} onClick={() => setShowMine((v) => !v)} disabled={!myClubs.length}
                title={myClubs.length ? `The ${myClubs.length} clubs in your team` : "Your team has not loaded"}>MY CLUBS</Button>
              {pinned.length > 0 && <Button tone="red" onClick={() => setPinned([])}>CLEAR PINS</Button>}
            </div>
          </Field>
        </PanelRow>
      </Panel>

      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 10, overflowX: "auto" }}>
        <table className="zeus-fixture-ticker" style={{ borderCollapse: "separate", borderSpacing: 4, width: "100%", minWidth: 120 + gws.length * 64 }}>
          <thead>
            <tr>
              <th style={{ ...lang(13, 700), textAlign: "left", position: "sticky", left: 0, background: T.card, zIndex: 2, padding: "4px 6px" }}>Club</th>
              {gws.map((gw) => <th key={gw} style={{ ...lang(13, 700), padding: "4px 2px", background: gw === currentGw ? "rgba(255,255,255,0.08)" : undefined, borderRadius: S.radiusSm }}>GW{gw}</th>)}
              <th style={{ ...lang(13, 700), padding: "4px 6px" }} title="Average fixture score over the range: higher is better for the club">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const hi = highlighted(row.club);
              return (
                <tr key={row.club} style={{ outline: hi ? `2px solid ${T.green}` : "none", borderRadius: S.radiusSm }}>
                  <td style={{ position: "sticky", left: 0, background: hi ? "rgba(0,255,106,0.12)" : T.card, zIndex: 1, padding: 0 }}>
                    <button type="button" onClick={() => togglePin(row.club)} className="fb-press"
                      title={pinned.includes(row.club) ? "Unpin" : "Pin this club"}
                      style={{ display: "flex", alignItems: "center", gap: S.gapSm, height: 44, padding: "0 8px", width: "100%", background: "transparent", border: "none", borderRadius: S.radiusSm }}>
                      <Kit team={row.club} size={20} />
                      <span style={lang(14, 700)}>{row.club}</span>
                      <span title={`Strength ${row.strength.strength}: attack ${row.strength.attack}, defence ${row.strength.defence}`}
                        style={{ ...val(12, "#FFFFFF", 700), background: T.box, borderRadius: S.radiusXs, padding: "1px 5px" }}>{row.strength.strength}</span>
                      {row.doubles > 0 && <span style={{ ...val(12, "#000000", 700), background: T.green, borderRadius: S.radiusXs, padding: "1px 5px" }}>×2</span>}
                    </button>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={i} style={{ padding: 0, height: 44, minWidth: 60 }}>
                      {cell.length === 0 ? (
                        <div title="No fixture" style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: S.radiusSm, border: `1px dashed ${T.line}`, ...val(14, "#FFFFFF") }}>–</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs, height: 44 }}>
                          {cell.map((e, j) => {
                            const fs = fixtureScore(row.club, e);
                            const [bg, ink] = colours(fs.score);
                            return (
                              <div key={j} title={`${row.club} ${fs.me} v ${e.opponent} ${fs.them} (${e.at === "H" ? "home" : "away"}, home advantage included). Gap ${fs.gap > 0 ? "+" : ""}${fs.gap}. Fixture score ${fs.score}/100.`}
                                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: S.gapXs, borderRadius: S.radiusSm, background: bg, minHeight: 0 }}>
                                <span style={lang(cell.length > 1 ? 12 : 13, 700, ink)}>{e.opponent}</span>
                                <span style={lang(12, 700, ink)}>({e.at})</span>
                                <span style={val(cell.length > 1 ? 12 : 13, ink, 700)}>{fs.score}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: "0 6px", textAlign: "center" }}>
                    <span style={val(15, row.avg === null ? "#FFFFFF" : row.avg >= 58 ? "#00E35F" : row.avg <= 42 ? "#FF2E58" : "#FFFFFF", 700)}>{row.avg === null ? "–" : Math.round(row.avg)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: S.gapMd, flexWrap: "wrap", alignItems: "center", padding: "10px 4px 2px" }}>
          {[["Favours the club (58+)", EASY], ["Even", MID], ["Favours the opponent (42 and under)", HARD]].map(([label, [bg]]) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: S.gapSm, ...lang(13, 600) }}>
              <span style={{ width: 14, height: 14, borderRadius: S.radiusXs, background: bg, display: "inline-block" }} />{label}
            </span>
          ))}
          <span style={lang(13, 600)}>Each cell: opponent, venue, fixture score 0-100 (50 even). The number by each club is its strength from results, attack and defence rated against every opponent faced, last three games double. Home is worth 8. Hover a cell for the gap. – blank · ×2 double · tap a club to pin it</span>
          <span style={{ marginLeft: "auto", ...lang(13, 600) }}><Link href="/defences" style={{ color: T.green, display: "inline-block", padding: "10px 4px", margin: "-10px -4px" }}>Strength tables →</Link></span>
        </div>
      </section>
    </div>
  );
}
