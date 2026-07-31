const positiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

/**
 * Collect every page even when Supabase enforces a smaller server-side cap than requested.
 * Offsets advance by the number actually returned, never by the requested page size.
 */
export async function collectAllPages(fetchPage, {
  pageSize = 1000,
  maxRows = 100000,
  label = "rows",
} = {}) {
  const requestedPageSize = positiveInteger(pageSize, 1000);
  const hardLimit = positiveInteger(maxRows, 100000);
  const rows = [];
  const pageSizes = [];
  let expectedCount = null;
  let offset = 0;

  for (;;) {
    const response = await fetchPage(offset, requestedPageSize);
    const data = Array.isArray(response) ? response : response?.data;
    const error = Array.isArray(response) ? null : response?.error;
    if (error) throw new Error(`${label}: ${error.message || error}`);
    if (!Array.isArray(data)) throw new Error(`${label}: page ${pageSizes.length + 1} did not return an array`);
    if (expectedCount === null && Number.isInteger(response?.count)) expectedCount = response.count;

    pageSizes.push(data.length);
    if (!data.length) break;
    rows.push(...data);
    offset += data.length;
    if (rows.length > hardLimit) {
      throw new Error(`${label}: pagination exceeded the ${hardLimit}-row safety limit`);
    }
  }

  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(`${label}: pagination truncation detected; expected ${expectedCount} rows, read ${rows.length}`);
  }

  return {
    rows,
    pagination: {
      requested_page_size: requestedPageSize,
      page_sizes: pageSizes,
      pages_with_rows: pageSizes.filter(Boolean).length,
      expected_count: expectedCount,
      rows_read: rows.length,
      server_cap_observed: pageSizes.slice(0, -1).some((size) => size > 0 && size < requestedPageSize),
      truncated: false,
    },
  };
}

export async function readSupabasePages(makeQuery, options = {}) {
  return collectAllPages(async (offset, pageSize) => {
    const query = makeQuery({ offset, pageSize, firstPage: offset === 0 });
    return query.range(offset, offset + pageSize - 1);
  }, options);
}
