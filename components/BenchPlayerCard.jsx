"use client";
import React from "react";
import { T, Kit, val } from "../lib/ui";
import PlayerPlate from "./PlayerPlate";
import Opp from "./Opp";

/* Shared by Dashboard, Builder and Squad so substitute cards cannot drift apart again. */
export default function BenchPlayerCard({
  player, xp = null, fixture = null, scale = null, showOpponent = true,
  slotLabel = null, onClick = null, marker = null,
  selected = false, target = false, captain = false, vice = false,
}) {
  const border = selected ? T.green : target ? "#FFFFFF" : "rgba(255,255,255,0.15)";
  const content = (
    <PlayerPlate name={player.web_name} xp={xp} flag={marker}
      captain={captain} vice={vice} width="auto" compact transparent />
  );

  return (
    <div className="zeus-bench-card" style={{ border: `1px solid ${border}` }}>
      {slotLabel !== null && slotLabel !== undefined && (
        <span className="zeus-bench-slot" style={val(12, "#FFFFFF", 500)}>{slotLabel}</span>
      )}
      <Kit team={player.team} size={17} />
      {onClick ? (
        <button type="button" onClick={() => onClick(player)} className="zeus-bench-player-button">
          {content}
        </button>
      ) : (
        <span className="zeus-bench-player-button">{content}</span>
      )}
      {showOpponent && (
        <span className="zeus-bench-opponent">
          <Opp fx={fixture} scale={scale} size="xs" showNumber={false} />
        </span>
      )}
    </div>
  );
}
