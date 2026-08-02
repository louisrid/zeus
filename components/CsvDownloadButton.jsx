"use client";

export default function CsvDownloadButton({ players = [], gwFrom = 1, gwTo = 1 }) {
  const download = () => {
    const gameweeks = Array.from({ length: gwTo - gwFrom + 1 }, (_, index) => gwFrom + index);
    const header = [
      "Player", "Full name", "Club", "Position", "Price", "Ownership %",
      ...gameweeks.map((gw) => `GW${gw} xPts`),
      "Total xPts", "xPts per million", "Expected minutes", "Average start probability",
    ];
    const body = players.map((player) => [
      player.name,
      player.full_name,
      player.club,
      player.position,
      player.price,
      player.ownership,
      ...gameweeks.map((gw) => player.gameweeks?.[String(gw)]?.xpts ?? ""),
      player.total_xpts,
      player.xpts_per_million,
      player.expected_minutes_total,
      player.start_probability_average,
    ]);
    const csv = [header, ...body]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zeus-projections-gw${gwFrom}-gw${gwTo}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  return <button type="button" onClick={download} disabled={!players.length}>Download CSV</button>;
}
