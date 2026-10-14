/**
 * D38 Milestone 3: who was told about a quote request, per round, and what
 * each provider did. Shared by the Waiting now tab (a row's "Show providers")
 * and Booking 360's Quotes tab ("Who was notified").
 *
 * Source: GET /api/v1/admin/marketplace-health/bookings/:id/invites
 * (marketplace-health.service getRequestInvites). meta.applicable is false
 * for a booking that is not a quote request. Phones arrive masked except for
 * super_admin; ProviderCallButton reveals through the audit-logged
 * reveal-contact route. "Responded" means the provider sent a quote; an
 * invite that was only closed (expired, taken) is not a response.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { RefreshCw } from '@/components/icons';
import { ProviderCallButton } from './ProviderCallButton';
import {
  INVITE_SOURCE_LABELS, INVITE_STATUS_LABELS, fetchRequestInvites, formatDurationMinutes,
  formatManilaDateTime, humanize, marketplaceKeys, plural, type RequestInviteRow,
} from './marketplace-api';

// An invite with source 'inbox' was recorded when the provider opened the
// request from their list (sent_at is that moment); nobody notified them.
function inviteStatusText(invite: RequestInviteRow): string {
  return INVITE_STATUS_LABELS[invite.status] ?? humanize(invite.status);
}

function respondedText(invite: RequestInviteRow): string {
  if (invite.responseMinutes === null || !invite.respondedAt) return 'No quote';
  return `${formatManilaDateTime(invite.respondedAt)} (after ${formatDurationMinutes(invite.responseMinutes)})`;
}

export function InvitedProvidersList({ bookingId }: { bookingId: string }): React.ReactElement {
  const invites = useQuery({
    queryKey: marketplaceKeys.invites(bookingId),
    queryFn: () => fetchRequestInvites(bookingId),
  });

  if (invites.isLoading) return <LoadingState label="Loading notified providers..." />;
  if (invites.isError || !invites.data) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Notified providers could not be loaded.</p>
        <p className="mt-1">{getErrorMessage(invites.error)}</p>
        <Button className="mt-2" variant="outline" size="sm" onClick={() => void invites.refetch()}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  const { applicable, currentRound, invites: rows } = invites.data;
  if (!applicable) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        This booking is not a quote request, so no providers were invited to quote.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No provider has been notified about this request, and none has opened it from their list.
      </p>
    );
  }

  const rounds = Array.from(new Set(rows.map((row) => row.round))).sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      {rounds.map((round) => {
        const roundRows = rows.filter((row) => row.round === round);
        const quoted = roundRows.filter((row) => row.responseMinutes !== null).length;
        return (
          <section key={round} aria-label={`Round ${round} providers`}>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Round {round}{currentRound === round ? ' (current)' : ''}: {roundRows.length}{' '}
              {plural(roundRows.length, 'provider', 'providers')}, {quoted} sent a quote
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-[var(--color-text-tertiary)]">
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">How</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Notified</th>
                    <th className="py-2 pr-3 font-medium">Opened</th>
                    <th className="py-2 pr-3 font-medium">Quote sent</th>
                    <th className="py-2 font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {roundRows.map((invite) => (
                    <tr key={invite.inviteId} className="border-t border-[var(--color-border)] align-top">
                      <td className="py-2 pr-3 font-medium text-[var(--color-text)]">{invite.providerName}</td>
                      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                        {INVITE_SOURCE_LABELS[invite.source] ?? humanize(invite.source)}
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-text)]">{inviteStatusText(invite)}</td>
                      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                        {invite.source === 'inbox'
                          ? `Not notified (found ${formatManilaDateTime(invite.sentAt)})`
                          : formatManilaDateTime(invite.sentAt)}
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
                        {invite.viewedAt ? formatManilaDateTime(invite.viewedAt) : 'Not opened'}
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{respondedText(invite)}</td>
                      <td className="py-2">
                        <ProviderCallButton
                          providerId={invite.providerId}
                          providerName={invite.providerName}
                          phone={invite.phone}
                          contactMasked={invite.contactMasked}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-xs text-[var(--color-text-tertiary)]">Times are Manila time.</p>
    </div>
  );
}
