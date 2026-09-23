"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

/* ONE TABLE FOR REFERENCE DATA.
 *
 * The player page drew four tables by hand: gameweeks, career, finishing, shots. Each had its own
 * header height, row height, padding, alignment rules and mobile behaviour, so the same page carried
 * four slightly different tables. This is the one table. Columns declare a key, a heading, a width and
 * an alignment; rows are plain objects; a column can render its own cell. The header is 26 high, rows
 * are 46, the first column is left-aligned text and every other is centred data, and the whole thing
 * scrolls sideways inside its own container on a phone rather than dropping columns. */
export default function DataTable({ columns, rows, rowKey, minWidth = 560, emptyText = "Nothing to show." }) {
  const grid = columns.map((column) => column.width || "1fr").join(" ");
  if (!rows.length) {
    return <p style={{ ...lang(15, 600), margin: 0, lineHeight: 1.5 }}>{emptyText}</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs, minWidth }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: S.gapSm, alignItems: "center", padding: "0 10px", height: 26 }}>
          {columns.map((column, index) => (
            <span key={column.key} title={column.title || undefined}
              style={{ ...code(11.5), textAlign: index === 0 ? "left" : (column.align || "center") }}>
              {column.short || column.heading}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={rowKey(row)}
            style={{ display: "grid", gridTemplateColumns: grid, gap: S.gapSm, alignItems: "center",
              padding: "0 10px", height: 46, borderRadius: S.radiusSm, background: T.row }}>
            {columns.map((column, index) => {
              const raw = column.render ? column.render(row) : row[column.key];
              const shown = raw === null || raw === undefined || raw === "" ? "–" : raw;
              const isFirst = index === 0;
              return (
                <span key={column.key}
                  style={{ ...(column.mono ? code(13) : isFirst ? val(13.5) : val(13.5, column.color ? column.color(row) : "#FFFFFF")),
                    textAlign: isFirst ? "left" : (column.align || "center"), minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shown}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
