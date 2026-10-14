/**
 * D38 Milestone 3: "Response times", how long customers waited for their
 * first quote, by category, by city, or both.
 *
 * Source: GET /api/v1/admin/marketplace-health/response-times
 * (marketplace-health.service getResponseTimes). The time to first response
 * is the first quote's time minus the request's time. p50 is the middle
 * request (half waited less); p90 is the time 9 in 10 requests beat.
 * Requests with no quote are counted under "No quote" and left out of p50 and
 * p90; "Answered within 30 min" counts them as not answered in time.
 *
 * While a new grouping loads, the previous figures stay on screen
 * (keepPreviousData). Their heading and row names follow the grouping they
 * were fetched with (ResponseTimesResult.groupBy), never the button just
 * pressed, so category figures are never shown under city names; a status
 * line says the new grouping is loading.
 */
import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { DateRangeFields, TabError, rangeParams, type DateRangeValue } from './MarketplaceParts';
import {
  fetchResponseTimes, formatDurationMinutes, formatPercent, marketplaceKeys, type ResponseTimeGroup,
  type ResponseTimeGroupRow,
} from './marketplace-api';

const GROUP_OPTIONS: Array<{ value: ResponseTimeGroup; label: string }> = [
  { value: 'category', label: 'By category' },
  { value: 'city', label: 'By city' },
  { value: 'category_city', label: 'By category and city' },
];

const GROUP_HEADERS: Record<ResponseTimeGroup, string> = {
  category: 'Category',
  city: 'City',
  category_city: 'Category and city',
};

const GROUP_WORDS: Record<ResponseTimeGroup, string> = {
  category: 'category',
  city: 'city',
  category_city: 'category and city',
};

function groupName(row: ResponseTimeGroupRow, groupBy: ResponseTimeGroup): string {
  const category = row.categoryName ?? 'No category';
  const city = row.city ?? 'No city';
  if (groupBy === 'category') return category;
  if (groupBy === 'city') return city;
  return `${category}, ${city}`;
}

function OverallFigures({ overall }: { overall: ResponseTimeGroupRow }): React.ReactElement {
  const figures = [
    { label: 'Median first quote (p50)', value: formatDurationMinutes(overall.p50Minutes) },
    { label: '9 in 10 answered within (p90)', value: formatDurationMinutes(overall.p90Minutes) },
    { label: 'Answered within 30 min', value: formatPercent(overall.within30Pct) },
    { label: 'Requests', value: String(overall.requests) },
    { label: 'Got a quote', value: String(overall.responded) },
    { label: 'No quote', value: String(overall.noResponse) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="All requests in the period">
      {figures.map((figure) => (
        <div key={figure.label} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
          <dt className="text-xs text-[var(--color-text-tertiary)]">{figure.label}</dt>
          <dd className="mt-1 text-lg font-bold text-[var(--color-text)]">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResponseTimesTab(): React.ReactElement {
  const [range, setRange] = useState<DateRangeValue>({ from: '', to: '' });
  const [groupBy, setGroupBy] = useState<ResponseTimeGroup>('category');
  const params = { ...rangeParams(range), groupBy };
  const times = useQuery({
    queryKey: marketplaceKeys.responseTimes(params),
    queryFn: () => fetchResponseTimes(params),
    placeholderData: keepPreviousData,
  });
  const data = times.data;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <DateRangeFields value={range} onChange={setRange} resolved={data ?? null} idPrefix="response-times" />
        <div role="group" aria-label="Group response times" className="flex flex-wrap gap-2">
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={groupBy === option.value}
              onClick={() => setGroupBy(option.value)}
              className={`min-h-11 rounded-md border px-3 text-sm font-medium ${
                groupBy === option.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      {times.isLoading ? (
        <LoadingState label="Loading response times..." />
      ) : times.isError || !data ? (
        <TabError title="Response times could not be loaded" error={times.error} onRetry={() => void times.refetch()} />
      ) : data.groups.length === 0 ? (
        <Card className="p-6">
          <EmptyState title="No quote requests in this period" description="There is nothing to measure for the chosen dates." />
        </Card>
      ) : (
        <div className="space-y-4">
          {times.isPlaceholderData && data.groupBy !== groupBy ? (
            <p role="status" className="text-sm text-[var(--color-text-secondary)]">
              Loading the figures by {GROUP_WORDS[groupBy]}. Until they arrive, the table below is still by {GROUP_WORDS[data.groupBy]}.
            </p>
          ) : null}
          {data.overall ? <OverallFigures overall={data.overall} /> : null}
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-[var(--color-text-tertiary)]">
                    <th className="py-2 pr-3 font-medium">{GROUP_HEADERS[data.groupBy]}</th>
                    <th className="py-2 pr-3 font-medium">Requests</th>
                    <th className="py-2 pr-3 font-medium">Got a quote</th>
                    <th className="py-2 pr-3 font-medium">No quote</th>
                    <th className="py-2 pr-3 font-medium">Median (p50)</th>
                    <th className="py-2 pr-3 font-medium">p90</th>
                    <th className="py-2 font-medium">Within 30 min</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((row) => {
                    const name = groupName(row, data.groupBy);
                    return (
                      <tr key={name} data-testid="response-time-row" className="border-t border-[var(--color-border)]">
                        <td className="py-2 pr-3 font-medium text-[var(--color-text)]">{name}</td>
                        <td className="py-2 pr-3">{row.requests}</td>
                        <td className="py-2 pr-3">{row.responded}</td>
                        <td className="py-2 pr-3">{row.noResponse}</td>
                        <td className="py-2 pr-3">{row.p50Minutes === null ? 'No quotes yet' : formatDurationMinutes(row.p50Minutes)}</td>
                        <td className="py-2 pr-3">{row.p90Minutes === null ? 'No quotes yet' : formatDurationMinutes(row.p90Minutes)}</td>
                        <td className="py-2">{formatPercent(row.within30Pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="pt-2 text-xs text-[var(--color-text-tertiary)]">
              Measured from the request to its first quote. Requests are counted by the Manila day they were created.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
