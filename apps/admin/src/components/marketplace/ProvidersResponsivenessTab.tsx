/**
 * D38 Milestone 3: "Providers", how each provider answered the requests sent
 * to them, so the back office knows whom to call, coach or replace.
 *
 * Source: GET /api/v1/admin/marketplace-health/providers
 * (marketplace-health.service getProviderResponsiveness), counted over the
 * invites sent on the chosen Manila days. A response is a quote. These
 * numbers are for follow-up only: they are not written to the provider and
 * nothing in matching, ranking or quality scores reads them (E47).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { DateRangeFields, Pager, TabError, rangeParams, type DateRangeValue } from './MarketplaceParts';
import { ProviderCallButton } from './ProviderCallButton';
import {
  PROVIDER_SORTS, fetchProviderResponsiveness, formatDurationMinutes, formatManilaDateTime, formatRate, humanize,
  marketplaceKeys, type ProviderSort,
} from './marketplace-api';

const PAGE_SIZE = 25;

const SORT_LABELS: Record<ProviderSort, string> = {
  invites: 'Most requests received',
  slowest: 'Slowest to quote',
  lowest_response_rate: 'Lowest response rate',
};

export function ProvidersResponsivenessTab(): React.ReactElement {
  const [range, setRange] = useState<DateRangeValue>({ from: '', to: '' });
  const [sort, setSort] = useState<ProviderSort>('invites');
  const [page, setPage] = useState(1);
  const params = { ...rangeParams(range), sort, page, pageSize: PAGE_SIZE };
  const providers = useQuery({
    queryKey: marketplaceKeys.providers(params),
    queryFn: () => fetchProviderResponsiveness(params),
    placeholderData: keepPreviousData,
  });
  const data = providers.data;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFields
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
            resolved={data ?? null}
            idPrefix="providers"
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="providers-sort">
            Sort
            <select
              id="providers-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as ProviderSort);
                setPage(1);
              }}
              className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
            >
              {PROVIDER_SORTS.map((value) => (
                <option key={value} value={value}>{SORT_LABELS[value]}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          For back-office follow-up only. These numbers are not used to rank providers or to decide who gets requests.
        </p>
      </Card>

      {providers.isLoading ? (
        <LoadingState label="Loading provider responsiveness..." />
      ) : providers.isError || !data ? (
        <TabError title="Provider responsiveness could not be loaded" error={providers.error} onRetry={() => void providers.refetch()} />
      ) : data.rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState title="No provider received a request in this period" description="Choose other dates, or check Waiting now for open requests." />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--color-text-tertiary)]">
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Requests received</th>
                  <th className="py-2 pr-3 font-medium">Opened</th>
                  <th className="py-2 pr-3 font-medium">Sent a quote</th>
                  <th className="py-2 pr-3 font-medium">Median time to quote</th>
                  <th className="py-2 pr-3 font-medium">Quotes accepted</th>
                  <th className="py-2 pr-3 font-medium">Last active</th>
                  <th className="py-2 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.providerId} data-testid="provider-row" className="border-t border-[var(--color-border)] align-top">
                    <td className="py-2 pr-3">
                      <Link to={`/providers/${row.providerId}`} className="font-medium text-[var(--color-secondary)] hover:underline">
                        {row.providerName}
                      </Link>
                      <span className="block text-xs text-[var(--color-text-secondary)]">
                        {humanize(row.providerStatus)} · {row.isAvailable ? 'Available' : 'Not available'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {row.invites}
                      {row.notified !== row.invites ? (
                        <span className="block text-xs text-[var(--color-text-secondary)]">{row.notified} notified</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{formatRate(row.viewedRate)} <span className="text-xs text-[var(--color-text-secondary)]">({row.viewed})</span></td>
                    <td className="py-2 pr-3">{formatRate(row.responseRate)} <span className="text-xs text-[var(--color-text-secondary)]">({row.responded})</span></td>
                    <td className="py-2 pr-3">{row.medianResponseMinutes === null ? 'No quotes' : formatDurationMinutes(row.medianResponseMinutes)}</td>
                    <td className="py-2 pr-3">{row.quotesAccepted}</td>
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{formatManilaDateTime(row.lastActiveAt)}</td>
                    <td className="py-2">
                      <ProviderCallButton
                        providerId={row.providerId}
                        providerName={row.providerName}
                        phone={row.phone}
                        contactMasked={row.contactMasked}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} label="Provider pages" />
          <p className="pt-2 text-xs text-[var(--color-text-tertiary)]">
            Counted over requests sent on the chosen Manila days. A response means the provider sent a quote.
          </p>
        </Card>
      )}
    </div>
  );
}
