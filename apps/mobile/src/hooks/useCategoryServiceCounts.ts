/**
 * Human audit 2026-10-13 (HA-DISC): a category with zero active services used
 * to open a "No services yet" dead end (4 of 10 live categories). GET
 * /api/v1/catalog carries no service count, but the existing public GET
 * /api/v1/catalog/full lists every active category with its active services,
 * so screens read the counts from it without any API change.
 *
 * The customer home grid and the search screen's category chips both use this,
 * so a customer is never offered a category that leads nowhere.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import api from '@/services/api';

/** categoryId -> number of active services. */
export type CategoryServiceCounts = Record<string, number>;

/**
 * Returns categoryId -> number of active services. A category missing from
 * the result (or a failed / empty response) is treated as "unknown" by
 * {@link withBookableServices}, so a slow or failing count request never hides
 * real services.
 */
export async function getCategoryServiceCounts(): Promise<CategoryServiceCounts> {
  const res = await api.get<{ success: boolean; data?: Array<{ id?: unknown; subcategories?: unknown }> }>(
    '/api/v1/catalog/full',
  );
  const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
  const counts: CategoryServiceCounts = {};
  for (const row of rows) {
    if (row && typeof row.id === 'string' && Array.isArray(row.subcategories)) {
      counts[row.id] = row.subcategories.length;
    }
  }
  return counts;
}

/** Shared query: one request serves the home grid and the search chips. */
export function useCategoryServiceCounts(): UseQueryResult<CategoryServiceCounts> {
  return useQuery({
    queryKey: ['catalog-service-counts'],
    queryFn: getCategoryServiceCounts,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Drops only the categories we positively know have no active services. With
 * no counts yet (loading, offline, error) every category stays.
 */
export function withBookableServices<T extends { id: string }>(
  categories: T[],
  counts: CategoryServiceCounts | undefined,
): T[] {
  if (!counts) return categories;
  return categories.filter((category) => {
    const count = counts[category.id];
    return count === undefined || count > 0;
  });
}
