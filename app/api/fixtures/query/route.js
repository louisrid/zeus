import { parseFixtureQueryParams } from "../../../../lib/fixture-query.mjs";
import { queryFixturesFromDatabase } from "../../../../lib/server/fixture-query-source.mjs";
import { authoriseReadOnlyRequest, jsonResponse, optionsResponse } from "../../../../lib/read-only-api-auth.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const auth = authoriseReadOnlyRequest(request);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  try {
    const params = parseFixtureQueryParams(new URL(request.url).searchParams);
    return jsonResponse(await queryFixturesFromDatabase(params));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RangeError ? 400 : 503;
    console.error("Fixture query API failure", error);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
