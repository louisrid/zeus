import CsvDownloadButton from "./CsvDownloadButton";

const value = (searchParams, key, fallback = "") => {
  const raw = searchParams?.[key];
  return Array.isArray(raw) ? raw[0] ?? fallback : raw ?? fallback;
};

const format = (number, digits = 2) => {
  const parsed = Number(number);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "-";
};

export default function ProjectionQueryPage({
  result,
  searchParams = {},
  title = "Players",
  showBreakdown = false,
  allowCsv = false,
}) {
  const gameweeks = Array.from(
    { length: result.gw_to - result.gw_from + 1 },
    (_, index) => result.gw_from + index,
  );
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2>{title}</h2>
      <form method="get" className="zeus-query-form">
        <label>Name<input name="name" defaultValue={value(searchParams, "name")} /></label>
        <label>Club codes<input name="clubs" placeholder="MUN,ARS" defaultValue={value(searchParams, "clubs")} /></label>
        <label>Position
          <select name="positions" defaultValue={value(searchParams, "positions")}>
            <option value="">Any</option>
            <option value="GKP">GKP</option>
            <option value="DEF">DEF</option>
            <option value="MID">MID</option>
            <option value="FWD">FWD</option>
          </select>
        </label>
        <label>Min price<input type="number" step="0.1" name="price_min" defaultValue={value(searchParams, "price_min")} /></label>
        <label>Max price<input type="number" step="0.1" name="price_max" defaultValue={value(searchParams, "price_max")} /></label>
        <label>Min ownership %<input type="number" step="0.1" name="ownership_min" defaultValue={value(searchParams, "ownership_min")} /></label>
        <label>Max ownership %<input type="number" step="0.1" name="ownership_max" defaultValue={value(searchParams, "ownership_max")} /></label>
        <label>GW from<input type="number" min="1" max="38" name="gw_from" defaultValue={result.gw_from} /></label>
        <label>GW to<input type="number" min="1" max="38" name="gw_to" defaultValue={result.gw_to} /></label>
        <label>Sort
          <select name="sort_by" defaultValue={value(searchParams, "sort_by", "xpts")}>
            <option value="xpts">xPts</option>
            <option value="value">xPts per million</option>
            <option value="price">Price</option>
            <option value="ownership">Ownership</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label>Direction
          <select name="sort_direction" defaultValue={value(searchParams, "sort_direction", "desc")}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <button type="submit">Apply</button>
        <a href={title === "Players" ? "/players" : "/projections"}>Reset</a>
      </form>

      <section>
        <div><strong>GW range:</strong> GW{result.gw_from} to GW{result.gw_to}</div>
        <div><strong>Generation:</strong> {result.generation_id || "-"}</div>
        <div><strong>Model:</strong> {result.model || "-"}</div>
        <div><strong>Timestamp:</strong> {result.timestamp || "-"}</div>
        <div><strong>Rows:</strong> {result.returned_count} returned from {result.matched_count} matched</div>
        {result.truncated && <div><strong>Truncated:</strong> yes; next offset {result.next_offset}</div>}
        {allowCsv && <CsvDownloadButton players={result.players} gwFrom={result.gw_from} gwTo={result.gw_to} />}
      </section>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            <tr>
              {[
                "Player", "Club", "Pos", "Price", "Own %", "Total xPts", "xPts/£m",
                "Expected min", "Avg start %",
                ...(showBreakdown ? gameweeks.map((gw) => `GW${gw}`) : []),
              ].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 7, borderBottom: "1px solid #555" }}>{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.players.map((player) => (
              <tr key={player.player_id}>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{player.name}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{player.club || "-"}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{player.position || "-"}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{format(player.price, 1)}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{format(player.ownership, 1)}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{format(player.total_xpts)}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{format(player.xpts_per_million)}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{format(player.expected_minutes_total, 1)}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{player.start_probability_average === null ? "-" : format(player.start_probability_average * 100, 1)}</td>
                {showBreakdown && gameweeks.map((gw) => (
                  <td key={gw} style={{ padding: 7, borderBottom: "1px solid #333" }}
                    title={`Expected minutes: ${format(player.gameweeks?.[String(gw)]?.expected_minutes, 1)}; start probability: ${format((player.gameweeks?.[String(gw)]?.start_probability ?? Number.NaN) * 100, 1)}%`}>
                    {format(player.gameweeks?.[String(gw)]?.xpts)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
