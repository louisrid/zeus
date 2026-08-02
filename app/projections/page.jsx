import ProjectionQueryPage from "../../components/ProjectionQueryPage";
import { parsePlayerQueryParams } from "../../lib/player-query.mjs";
import { queryPlayersFromDatabase } from "../../lib/server/player-query-source.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectionsPage({ searchParams = {} }) {
  try {
    const parsed = parsePlayerQueryParams(searchParams);
    const result = await queryPlayersFromDatabase({
      ...parsed,
      includeBreakdown: true,
      limit: 5000,
      offset: 0,
    });
    return <ProjectionQueryPage result={result} searchParams={searchParams} title="Projections" showBreakdown allowCsv />;
  } catch (error) {
    return <pre>Projection page error: {error instanceof Error ? error.message : String(error)}</pre>;
  }
}
