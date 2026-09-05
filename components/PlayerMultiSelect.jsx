"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

/* CHOOSING PLAYERS BY NAME, SEVERAL AT A TIME.
 *
 * The transfer screen used to ask you to tap fifteen cards to say which ones could go, which meant
 * saying "not him" fourteen times to say "him". It also had no way to name a player who is not in your
 * squad, so a target you wanted the search to consider could only be reached by hoping the solver
 * happened to agree with you.
 *
 * This is one control for both jobs: type a name, pick it, pick another, and the set is what the search
 * is given. It is deliberately not a native multi-select, which on a phone is a scrolling column of
 * unlabelled rows with no search and no way to see what is already chosen.
 */

export default function PlayerMultiSelect({
  label,
  pool = [],
  value = [],
  onChange,
  placeholder = "Type a name",
  tone = T.tag,
  emptyHint = null,
  max = null,
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const chosen = new Set((value || []).map(Number));

  const byId = React.useMemo(
    () => new Map(pool.map((player) => [Number(player.fpl_id), player])),
    [pool],
  );

  /* Case and accent insensitive, so "gross" finds Groß and "jao" finds João Pedro. Matching only the
     start of a word rather than anywhere in the string keeps "an" from returning half the league. */
  const normalise = (text) => String(text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const matches = React.useMemo(() => {
    const q = normalise(query).trim();
    if (!q) return [];
    return pool
      .filter((player) => !chosen.has(Number(player.fpl_id)))
      .filter((player) => {
        const name = normalise(player.web_name);
        const club = normalise(player.team);
        return name.startsWith(q) || name.includes(` ${q}`) || club === q;
      })
      .slice(0, 8);
    // chosen is derived from value, which is in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, query, value]);

  const add = (player) => {
    const id = Number(player.fpl_id);
    if (chosen.has(id)) return;
    if (max && (value || []).length >= max) return;
    onChange([...(value || []), id]);
    setQuery("");
    setOpen(false);
  };

  const remove = (id) => onChange((value || []).filter((each) => Number(each) !== Number(id)));

  /* Fluid, not fixed. A 190px minimum with the default box sizing means the padding and border are added
     ON TOP of it, so on a 390px phone the input could be wider than the column it sits in and push the
     row sideways. It fills whatever width it is given instead, down to a floor that still fits a name. */
  const box = {
    height: 32, background: T.plate, border: `1px solid ${T.line}`, borderRadius: 8,
    padding: "0 10px", ...lang(13, 600, "#FFFFFF"), outline: "none",
    width: "100%", boxSizing: "border-box", minWidth: 0,
  };

  return (
    <div data-zeus-feature="player-multiselect-v1"
      style={{ display: "flex", flexDirection: "column", gap: 7,
        flex: "1 1 220px", minWidth: 0, maxWidth: "100%" }}>
      <span style={code(12, T.xp)}>{label}</span>

      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          /* A blur that fires before the click lands would close the list and swallow the choice, so
             closing is deferred by a tick. */
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches.length) { event.preventDefault(); add(matches[0]); }
            if (event.key === "Escape") setOpen(false);
          }}
          /* iOS capitalises the first letter and autocorrects as you type, which turns "van Ewijk" into
             "Van" and then into an English word, and the search then matches nothing. A name is not
             prose, so the phone is told to leave it alone. */
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={max && (value || []).length >= max ? `Limit ${max} reached` : placeholder}
          aria-label={label}
          disabled={Boolean(max && (value || []).length >= max)}
          style={box}
        />
        {/* The list is anchored to both edges so it cannot hang off the side of a narrow screen, and
            capped in height so a long list scrolls rather than running past the fold. */}
        {open && matches.length > 0 && (
          <div style={{ position: "absolute", zIndex: 30, top: 36, left: 0, right: 0,
            maxHeight: 260, overflowY: "auto",
            background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radiusSm,
            boxShadow: "0 12px 28px rgba(0,0,0,0.55)" }}>
            {matches.map((player) => (
              <button key={player.fpl_id} type="button" onMouseDown={() => add(player)}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 8,
                  padding: "8px 11px", background: "none", border: "none", cursor: "pointer",
                  textAlign: "left" }}>
                <span style={lang(13.5, 700, "#FFFFFF")}>{player.web_name}</span>
                <span style={lang(12, 600)}>{player.team}</span>
                <span style={lang(12, 600)}>{player.position}</span>
                <span style={{ marginLeft: "auto", ...val(12.5) }}>{Number(player.price).toFixed(1)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(value || []).length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(value || []).map((id) => {
            const player = byId.get(Number(id));
            return (
              <button key={id} type="button" onClick={() => remove(id)}
                aria-label={`Remove ${player ? player.web_name : id}`}
                className="fb-press"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26,
                  padding: "0 9px", borderRadius: 8, background: T.plate,
                  border: `1px solid ${tone}`, ...lang(12.5, 700, "#FFFFFF") }}>
                {player ? player.web_name : `#${id}`}
                <span style={{ ...lang(13, 700, tone) }}>×</span>
              </button>
            );
          })}
        </div>
      ) : (
        emptyHint && <span style={{ ...lang(12, 600), opacity: 0.75 }}>{emptyHint}</span>
      )}
    </div>
  );
}
