import { parseFixtureQueryParams } from "../../lib/fixture-query.mjs";
import { queryFixturesFromDatabase } from "../../lib/server/fixture-query-source.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const value = (searchParams, key, fallback = "") => {
  const raw = searchParams?.[key];
  return Array.isArray(raw) ? raw[0] ?? fallback : raw ?? fallback;
};

export default async function FixturesPage({ searchParams = {} }) {
  try {
    const params = parseFixtureQueryParams(searchParams);
    const result = await queryFixturesFromDatabase(params);
    const anomalies = result.club_gameweeks.filter((row) => row.blank || row.double);
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <h2>Fixtures</h2>
        <form method="get" className="zeus-query-form">
          <label>Club codes<input name="clubs" placeholder="MUN,ARS" defaultValue={value(searchParams, "clubs")} /></label>
          <label>GW from<input type="number" min="1" max="38" name="gw_from" defaultValue={result.gw_from} /></label>
          <label>GW to<input type="number" min="1" max="38" name="gw_to" defaultValue={result.gw_to} /></label>
          <button type="submit">Apply</button>
          <a href="/fixtures">Reset</a>
        </form>

        <div><strong>{result.returned_count}</strong> fixtures returned for GW{result.gw_from} to GW{result.gw_to}.</div>

        <section>
          <h3>Blank & double gameweeks</h3>
          {anomalies.length === 0 ? <p>None in this range.</p> : (
            <table style={{ borderCollapse: "collapse" }}>
              <thead><tr><th style={{ padding: 7 }}>Club</th><th style={{ padding: 7 }}>GW</th><th style={{ padding: 7 }}>Fixtures</th><th style={{ padding: 7 }}>Flag</th></tr></thead>
              <tbody>{anomalies.map((row) => (
                <tr key={`${row.club}-${row.gw}`}>
                  <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{row.club}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{row.gw}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{row.fixture_count}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{row.blank ? "BLANK" : "DOUBLE"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead><tr>{["GW", "Kickoff", "Home", "Away", "Score", "Flags"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 7, borderBottom: "1px solid #555" }}>{heading}</th>)}</tr></thead>
            <tbody>{result.fixtures.map((fixture) => (
              <tr key={fixture.fixture_id}>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{fixture.gw}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{fixture.kickoff_utc ? new Date(fixture.kickoff_utc).toLocaleString("en-GB") : "TBC"}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{fixture.home_club}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{fixture.away_club}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{fixture.finished ? `${fixture.home_goals}-${fixture.away_goals}` : "-"}</td>
                <td style={{ padding: 7, borderBottom: "1px solid #333" }}>{[
                  fixture.home_double ? `${fixture.home_club} DOUBLE` : null,
                  fixture.away_double ? `${fixture.away_club} DOUBLE` : null,
                ].filter(Boolean).join(", ") || "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    return <pre>Fixture page error: {error instanceof Error ? error.message : String(error)}</pre>;
  }
}
