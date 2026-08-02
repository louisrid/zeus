import { parsePlayerQueryParams } from "../../../../lib/player-query.mjs";
import { queryPlayersFromDatabase } from "../../../../lib/server/player-query-source.mjs";
import { authoriseReadOnlyRequest, jsonResponse, optionsResponse } from "../../../../lib/read-only-api-auth.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const auth = authoriseReadOnlyRequest(request);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  try {
    const params = parsePlayerQueryParams(new URL(request.url).searchParams);
    return jsonResponse(await queryPlayersFromDatabase(params));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RangeError ? 400 : 503;
    console.error("Player query API failure", error);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function OPTIONS() {
  return optionsResponse();
}
