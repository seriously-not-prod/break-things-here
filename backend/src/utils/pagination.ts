/**
 * Pagination Utility
 *
 * Parses and clamps page/limit query parameters and builds the SQL LIMIT/OFFSET
 * fragment. Returns a typed envelope for consistent API responses.
 *
 * Addresses: #270 (Task), #252 (Story)
 */

/** Maximum number of results that can be requested per page. */
const MAX_LIMIT = 100;
/** Default number of results per page when the caller omits `limit`. */
const DEFAULT_LIMIT = 20;

export interface PaginationParams {
  /** 1-based current page number. */
  page: number;
  /** Number of rows per page (clamped to [1, MAX_LIMIT]). */
  limit: number;
  /** SQL OFFSET value derived from page and limit. */
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Parses `page` and `limit` from Express query params.
 * Defaults and clamps values to safe bounds.
 *
 * @param query - Express req.query object (or any record with string values)
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawPage = parseInt(String(query.page ?? '1'), 10);
  const rawLimit = parseInt(String(query.limit ?? String(DEFAULT_LIMIT)), 10);

  // Ensure page is at least 1
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  // Clamp limit between 1 and MAX_LIMIT
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Builds the standard paginated response envelope.
 *
 * @param data  - The slice of records for the current page
 * @param total - Total number of matching records (for calculating page count)
 * @param params - Parsed pagination parameters
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
  };
}
