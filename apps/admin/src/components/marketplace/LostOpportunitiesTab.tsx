/**
 * D38 Milestone 3: "Lost opportunities", quote requests that closed without
 * a booking, so the back office can see where customers asked for help and
 * nobody (or no acceptable quote) came.
 *
 * Source: GET /api/v1/admin/marketplace-health/lost-opportunities
 * (marketplace-health.service getLostOpportunities). Each request carries
 * exactly one reason, decided on the server. The estimated value is the
 * customer's budget (midpoint of the range, else the one end given); with no
 * budget the row says "Budget not given" and adds nothing to the total. It is
 * an estimate of demand, not revenue.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ExternalLink } from '@/components/icons';
import { DateRangeFields, Pager, TabError, rangeParams, type DateRangeValue } from './MarketplaceParts';
import {
  CLOSED_BY_LABELS, LOST_REASONS, LOST_REASON_LABELS, areaLabel, fetchLostOpportunities, formatManilaDateTime,
  marketplaceKeys, plural, type LostReason,
} from './marketplace-api';

const PAGE_SIZE = 25;

export function LostOpportunitiesTab(): React.ReactElement {
  const [range, setRange] = useState<DateRangeValue>({ from: '', to: '' });
  const [reason, setReason] = useState<LostReason | ''>('');
  const [page, setPage] = useState(1);
  const params = { ...rangeParams(range), reason: reason || undefined, page, pageSize: PAGE_SIZE };
  const lost = useQuery({
    queryKey: marketplaceKeys.lost(params),
    queryFn: () => fetchLostOpportunities(params),
    placeholderData: keepPreviousData,
  });

  const changeRange = (next: DateRangeValue): void => {
    setRange(next);
    setPage(1);
  };

  const data = lost.data;
  const summary = data?.summary ?? null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFields value={range} onChange={changeRange} resolved={data ?? null} idPrefix="lost" />
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="lost-reason">
            Reason
            <select
              id="lost-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value as LostReason | '');
                setPage(1);
              }}
              className="h-11 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
            >
              <option value="">All reasons</option>
              {LOST_REASONS.map((value) => (
                <option key={value} value={value}>{LOST_REASON_LABELS[value]}</option>
              ))}
            </select>
          </label>
        </div>
        {summary ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-text)]">
              {`${summary.total} ${plural(summary.total, 'request', 'requests')} closed without a booking. `}
              {`Estimated value from customer budgets: ${formatCurrency(summary.estimatedValueCentavos)}.`}
            </p>
            {summary.withoutBudget > 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)]">
                {`${summary.withoutBudget} ${plural(summary.withoutBudget, 'request', 'requests')} had no budget and ${plural(summary.withoutBudget, 'is', 'are')} not counted in the estimate.`}
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-2" aria-label="Lost requests by reason">
              {LOST_REASONS.map((value) => (
                <li
                  key={value}
                  className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs text-[var(--color-text-secondary)]"
                >
                  {LOST_REASON_LABELS[value]}: <span className="font-semibold text-[var(--color-text)]">{summary.byReason[value] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {lost.isLoading ? (
        <LoadingState label="Loading lost requests..." />
      ) : lost.isError || !data ? (
        <TabError title="Lost requests could not be loaded" error={lost.error} onRetry={() => void lost.refetch()} />
      ) : data.rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="No lost requests in this period"
            description={reason
              ? 'No closed request without a booking matches this reason in the chosen dates.'
              : 'Every quote request created in the chosen dates was booked or is still open.'}
          />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--color-text-tertiary)]">
                  <th className="py-2 pr-3 font-medium">Request</th>
                  <th className="py-2 pr-3 font-medium">City</th>
                  <th className="py-2 pr-3 font-medium">Reason</th>
                  <th className="py-2 pr-3 font-medium">Closed by</th>
                  <th className="py-2 pr-3 font-medium">Providers</th>
                  <th className="py-2 pr-3 font-medium">Quotes</th>
                  <th className="py-2 pr-3 font-medium">Estimated value</th>
                  <th className="py-2 font-medium">Dates</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.bookingId} data-testid="lost-row" className="border-t border-[var(--color-border)] align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-[var(--color-text)]">{row.subcategoryName ?? row.categoryName ?? 'Service not recorded'}</p>
                      {row.subcategoryName && row.categoryName ? (
                        <p className="text-xs text-[var(--color-text-secondary)]">{row.categoryName}</p>
                      ) : null}
                      <Link
                        to={`/bookings/${row.bookingId}`}
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--color-secondary)] hover:underline"
                      >
                        <ExternalLink size={12} aria-hidden="true" /> Open booking
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-text)]">{areaLabel(row.barangay, row.city)}</td>
                    <td className="py-2 pr-3 text-[var(--color-text)]">{LOST_REASON_LABELS[row.reason] ?? row.reason}</td>
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{CLOSED_BY_LABELS[row.closedBy] ?? row.closedBy}</td>
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                      Invited {row.invited} · Opened {row.viewed}
                      <span className="block text-xs">
                        {row.rounds} {plural(row.rounds, 'round', 'rounds')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                      {row.quotes} sent{row.declinedQuotes > 0 ? `, ${row.declinedQuotes} declined` : ''}
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-text)]">
                      {row.estimatedValueCentavos === null ? 'Budget not given' : formatCurrency(row.estimatedValueCentavos)}
                    </td>
                    <td className="py-2 text-xs text-[var(--color-text-secondary)]">
                      Requested {formatManilaDateTime(row.createdAt)}
                      <span className="block">Closed {formatManilaDateTime(row.closedAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} label="Lost requests pages" />
          <p className="pt-2 text-xs text-[var(--color-text-tertiary)]">
            Requests are counted by the Manila day they were created. Estimated value comes from the customer&apos;s budget and is not revenue.
          </p>
        </Card>
      )}
    </div>
  );
}
