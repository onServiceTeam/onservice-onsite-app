/**
 * D38 Milestone 3: "Coverage", service area by category, to show where to
 * recruit.
 *
 * Source: GET /api/v1/admin/marketplace-health/coverage
 * (marketplace-health.service getCoverageGrid). Per cell: approved providers
 * assigned to the area who offer the category, how many of them sent a quote
 * in that category in the last 7 days, and the quote requests of the last 30
 * days whose nearest covering area is this one. A cell is red, with the words
 * "Needs recruiting", when fewer than the setting
 * ops_coverage_min_responsive_providers (3 by default) were responsive.
 * Display only.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { TabError } from './MarketplaceParts';
import { fetchCoverage, humanize, marketplaceKeys, plural, type CoverageCell } from './marketplace-api';

export function CoverageTab(): React.ReactElement {
  const coverage = useQuery({ queryKey: marketplaceKeys.coverage, queryFn: fetchCoverage });

  if (coverage.isLoading) return <LoadingState label="Loading coverage..." />;
  if (coverage.isError || !coverage.data) {
    return <TabError title="Coverage could not be loaded" error={coverage.error} onRetry={() => void coverage.refetch()} />;
  }

  const { threshold, areas, categories, cells } = coverage.data;
  if (areas.length === 0 || categories.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title={areas.length === 0 ? 'No active service areas' : 'No active service categories'}
          description="Coverage counts active, soft-launch and recruiting service areas against active categories."
        />
      </Card>
    );
  }

  const cellFor = new Map<string, CoverageCell>(cells.map((cell) => [`${cell.areaId}:${cell.categoryId}`, cell]));
  const redCells = cells.filter((cell) => cell.belowThreshold).length;

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Each cell shows responsive providers out of approved providers. Responsive means they sent a quote in that category in the
        last 7 days. Red cells have fewer than {threshold} responsive {plural(threshold, 'provider', 'providers')}
        {' '}({redCells} of {cells.length} cells). Display only.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">Area</th>
              {categories.map((category) => (
                <th key={category.id} scope="col" className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">
                  {category.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.id}>
                <th scope="row" className="px-2 py-1 align-top font-medium text-[var(--color-text)]">
                  {area.name}
                  <span className="block text-xs font-normal text-[var(--color-text-secondary)]">{humanize(area.status)}</span>
                </th>
                {categories.map((category) => {
                  const cell = cellFor.get(`${area.id}:${category.id}`);
                  if (!cell) {
                    return (
                      <td key={category.id} className="rounded-md bg-slate-50 px-2 py-2 text-xs text-[var(--color-text-tertiary)]">
                        Not measured
                      </td>
                    );
                  }
                  return (
                    <td
                      key={category.id}
                      data-testid="coverage-cell"
                      data-area={area.name}
                      data-category={category.name}
                      data-below-threshold={cell.belowThreshold ? 'true' : 'false'}
                      className={`rounded-md px-2 py-2 align-top text-xs ${
                        cell.belowThreshold ? 'border border-red-300 bg-red-50 text-red-900' : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                      }`}
                    >
                      <span className="block text-sm font-bold">
                        {cell.responsiveProviders} of {cell.approvedProviders}
                      </span>
                      <span className="block">{cell.requests30d} {plural(cell.requests30d, 'request', 'requests')} in 30 days</span>
                      {cell.belowThreshold ? <span className="mt-1 block font-semibold">Needs recruiting</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
