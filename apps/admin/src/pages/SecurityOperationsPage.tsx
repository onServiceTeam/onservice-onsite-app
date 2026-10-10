import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { adminConfig } from '@/config/admin.config';
import {
  Activity,
  Clock,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  X,
} from '@/components/icons';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface BlockedIp {
  id: string;
  ipAddress: string;
  reason: string;
  blockedBy: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface SecurityEvent {
  id: string;
  userId: string | null;
  userRole: string | null;
  userName: string | null;
  userEmail: string | null;
  providerProfileId: string | null;
  eventType: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface PagedResponse<T> {
  items: T[];
  pagination: Pagination;
}

interface EventFilters {
  eventType: string;
  ipAddress: string;
  userId: string;
}

interface BlockDraft {
  ipAddress: string;
  expiresInHours: string;
  reason: string;
}

const EMPTY_FILTERS: EventFilters = { eventType: '', ipAddress: '', userId: '' };
const EMPTY_BLOCK: BlockDraft = { ipAddress: '', expiresInHours: '24', reason: '' };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDate(value: string | null): string {
  if (!value) return 'No automatic expiry';
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

function humanize(value: string): string {
  return value.split('_').filter(Boolean).map((part) => (
    part.charAt(0).toUpperCase() + part.slice(1)
  )).join(' ');
}

function metadataSummary(metadata: Record<string, unknown>): string[] {
  return Object.entries(metadata).slice(0, 4).map(([key, value]) => {
    const rendered = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : 'Recorded detail';
    return `${humanize(key)}: ${rendered}`;
  });
}

function securitySubjectDestination(event: SecurityEvent): { to: string; label: string } | null {
  if (!event.userId) return null;
  const userId = encodeURIComponent(event.userId);
  if (event.userRole === 'customer') {
    return { to: `/customers/${userId}`, label: 'Open Customer 360' };
  }
  if (event.userRole === 'provider') {
    return event.providerProfileId
      ? { to: `/providers/${encodeURIComponent(event.providerProfileId)}`, label: 'Open Provider 360' }
      : { to: `/providers?search=${userId}`, label: 'Find Provider 360' };
  }
  if (event.userRole === 'provider_staff' && event.providerProfileId) {
    return {
      to: `/providers/${encodeURIComponent(event.providerProfileId)}`,
      label: 'Open employing Provider 360',
    };
  }
  if (event.userRole === 'admin' || event.userRole === 'super_admin' || event.userRole === 'dpo') {
    const staffSearch = event.userEmail || event.userName;
    return {
      to: staffSearch ? `/staff?search=${encodeURIComponent(staffSearch)}` : '/staff',
      label: 'Open Staff & Roles',
    };
  }
  return {
    to: `/support-tickets?userId=${userId}`,
    label: 'Open participant support history',
  };
}

function securitySubjectLabel(event: SecurityEvent): string {
  if (event.userRole === 'customer') return 'Customer';
  if (event.userRole === 'provider') return 'Provider';
  if (event.userRole === 'provider_staff') return 'Provider staff';
  if (event.userRole === 'admin' || event.userRole === 'super_admin' || event.userRole === 'dpo') return 'Staff';
  return 'User';
}

function PaginationControls({
  pagination,
  onPage,
  label,
}: {
  pagination: Pagination;
  onPage: (page: number) => void;
  label: string;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
      <p className="text-[var(--color-text-secondary)]">
        {pagination.total.toLocaleString()} {label} · Page {pagination.page} of {Math.max(1, pagination.totalPages)}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function SecurityOperationsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [blockedPage, setBlockedPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [blockDraft, setBlockDraft] = useState<BlockDraft>(EMPTY_BLOCK);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [unblockTarget, setUnblockTarget] = useState<BlockedIp | null>(null);
  const [unblockReason, setUnblockReason] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const blockedQuery = useQuery<PagedResponse<BlockedIp>>({
    queryKey: ['admin', 'security', 'blocked-ips', blockedPage],
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/blocked-ips', {
        params: { page: blockedPage, pageSize: adminConfig.defaultPageSize },
      });
      return { items: response.data.data, pagination: response.data.pagination };
    },
  });

  const eventsQuery = useQuery<PagedResponse<SecurityEvent>>({
    queryKey: ['admin', 'security', 'events', eventPage, filters],
    queryFn: async () => {
      const response = await api.get('/api/v1/admin/security-events', {
        params: {
          page: eventPage,
          pageSize: adminConfig.defaultPageSize,
          eventType: filters.eventType || undefined,
          ipAddress: filters.ipAddress || undefined,
          userId: filters.userId || undefined,
        },
      });
      return { items: response.data.data, pagination: response.data.pagination };
    },
  });

  function refreshSecurityData(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'security'] });
  }

  const blockMutation = useMutation({
    mutationFn: async (draft: BlockDraft) => api.post('/api/v1/admin/blocked-ips', {
      ipAddress: draft.ipAddress.trim(),
      expiresInHours: Number(draft.expiresInHours),
      reason: draft.reason.trim(),
    }),
    onSuccess: () => {
      setBanner({ kind: 'ok', text: 'Address blocked and recorded in the security timeline.' });
      setBlockDialogOpen(false);
      setBlockDraft(EMPTY_BLOCK);
      refreshSecurityData();
    },
    onError: (error) => setBanner({ kind: 'err', text: getErrorMessage(error) }),
  });

  const unblockMutation = useMutation({
    mutationFn: async ({ ipAddress, reason }: { ipAddress: string; reason: string }) => api.post(
      `/api/v1/admin/blocked-ips/${encodeURIComponent(ipAddress)}/unblock`,
      { reason: reason.trim() },
    ),
    onSuccess: () => {
      setBanner({
        kind: 'ok',
        text: 'Address unblocked. The five-minute worker can re-block it while recent failed attempts remain.',
      });
      setUnblockTarget(null);
      setUnblockReason('');
      refreshSecurityData();
    },
    onError: (error) => setBanner({ kind: 'err', text: getErrorMessage(error) }),
  });

  const filterError = filters.userId && !UUID_PATTERN.test(filters.userId)
    ? 'User ID must be a complete UUID.'
    : '';
  const blockReady = blockDraft.ipAddress.trim().length > 0
    && blockDraft.reason.trim().length >= 10
    && Number.isInteger(Number(blockDraft.expiresInHours))
    && Number(blockDraft.expiresInHours) >= 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">Support & Trust</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Security Operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Review active network blocks, investigate security events, and make reasoned block or unblock decisions. This is an operations record, not a replacement for Customer 360 or Provider 360 account review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings?category=security" className={buttonVariants({ variant: 'outline' })}>
            <Settings size={16} /> Security settings
          </Link>
          <Button type="button" onClick={() => setBlockDialogOpen(true)}>
            <Plus size={16} /> Block an address
          </Button>
        </div>
      </header>

      {banner && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border p-4 text-sm ${banner.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="min-h-11 min-w-11 rounded-md p-2">
            <X size={16} />
          </button>
        </div>
      )}

      <section aria-label="Security control summary" className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-lg bg-red-50 p-3 text-red-700"><Lock size={22} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Active blocks</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{blockedQuery.data?.pagination.total ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-lg bg-blue-50 p-3 text-blue-700"><RefreshCw size={22} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Detection cadence</p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text)]">Every 5 minutes</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Prior one-hour failure window</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-lg bg-amber-50 p-3 text-amber-700"><Clock size={22} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Automatic block</p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text)]">24 hours</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Manual blocks use the selected duration</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <span className="font-semibold">Operational boundary: </span>
        Cloudflare Turnstile must have valid production keys before CAPTCHA escalation can protect real OTP requests. Unblocking does not erase failed-attempt evidence, so the address may qualify again until the one-hour window ages out.
      </div>

      <section aria-labelledby="active-blocks-title">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-5">
            <div>
              <CardTitle id="active-blocks-title" className="flex items-center gap-2"><Shield size={19} /> Active IP blocks</CardTitle>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Full addresses are restricted to Admin and Super Admin operations.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => void blockedQuery.refetch()} aria-label="Refresh active blocks">
              <RefreshCw size={17} />
            </Button>
          </CardHeader>
          {blockedQuery.isLoading && <LoadingState label="Loading active IP blocks…" />}
          {blockedQuery.isError && (
            <ErrorState
              title="Active blocks could not load"
              description={getErrorMessage(blockedQuery.error)}
              action={<Button type="button" variant="outline" onClick={() => void blockedQuery.refetch()}>Try again</Button>}
            />
          )}
          {blockedQuery.data?.items.length === 0 && (
            <EmptyState title="No active IP blocks" description="No addresses are currently denied by the application block list." />
          )}
          {blockedQuery.data && blockedQuery.data.items.length > 0 && (
            <div className="grid gap-3 px-4 pb-4 xl:grid-cols-2">
              {blockedQuery.data.items.map((block) => (
                <article key={block.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-semibold text-[var(--color-text)]">{block.ipAddress}</p>
                      <p className="mt-2 text-sm leading-5 text-[var(--color-text-secondary)]">{block.reason}</p>
                    </div>
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800">Blocked</span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <div><dt className="text-[var(--color-text-tertiary)]">Expires</dt><dd className="mt-1 font-medium text-[var(--color-text)]">{formatDate(block.expiresAt)}</dd></div>
                    <div><dt className="text-[var(--color-text-tertiary)]">Created</dt><dd className="mt-1 font-medium text-[var(--color-text)]">{formatDate(block.createdAt)}</dd></div>
                  </dl>
                  <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => { setUnblockTarget(block); setUnblockReason(''); setBanner(null); }}>
                    Review unblock
                  </Button>
                </article>
              ))}
            </div>
          )}
          {blockedQuery.data && <PaginationControls pagination={blockedQuery.data.pagination} onPage={setBlockedPage} label="active blocks" />}
        </Card>
      </section>

      <section aria-labelledby="security-events-title">
        <Card>
          <CardHeader className="p-5">
            <CardTitle id="security-events-title" className="flex items-center gap-2"><Activity size={19} /> Security event timeline</CardTitle>
            <p className="text-sm text-[var(--color-text-secondary)]">Filter exact recorded events. This stream is separate from the wider Admin Audit Log.</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <form
              aria-label="Security event filters"
              className="grid gap-3 lg:grid-cols-[1fr_1fr_1.35fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                if (draftFilters.userId && !UUID_PATTERN.test(draftFilters.userId)) return;
                setEventPage(1);
                setFilters({
                  eventType: draftFilters.eventType.trim(),
                  ipAddress: draftFilters.ipAddress.trim(),
                  userId: draftFilters.userId.trim(),
                });
              }}
            >
              <Input aria-label="Event type" placeholder="Event type, e.g. ip_blocked" value={draftFilters.eventType} onChange={(event) => setDraftFilters((current) => ({ ...current, eventType: event.target.value }))} />
              <Input aria-label="IP address filter" placeholder="Exact IPv4 or IPv6" value={draftFilters.ipAddress} onChange={(event) => setDraftFilters((current) => ({ ...current, ipAddress: event.target.value }))} />
              <Input aria-label="User ID filter" placeholder="Exact user UUID" value={draftFilters.userId} onChange={(event) => setDraftFilters((current) => ({ ...current, userId: event.target.value }))} />
              <Button type="submit"><Search size={16} /> Apply</Button>
            </form>
            {draftFilters.userId && !UUID_PATTERN.test(draftFilters.userId) && (
              <p role="alert" className="mt-2 text-sm text-red-700">User ID must be a complete UUID.</p>
            )}
            {(filters.eventType || filters.ipAddress || filters.userId) && (
              <button
                type="button"
                className="mt-3 min-h-11 text-sm font-medium text-[var(--color-primary)] hover:underline"
                onClick={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setEventPage(1); }}
              >
                Clear event filters
              </button>
            )}
          </CardContent>
          {filterError && <ErrorState title="Check the event filters" description={filterError} />}
          {!filterError && eventsQuery.isLoading && <LoadingState label="Loading security events…" />}
          {!filterError && eventsQuery.isError && (
            <ErrorState
              title="Security events could not load"
              description={getErrorMessage(eventsQuery.error)}
              action={<Button type="button" variant="outline" onClick={() => void eventsQuery.refetch()}>Try again</Button>}
            />
          )}
          {!filterError && eventsQuery.data?.items.length === 0 && (
            <EmptyState title="No security events match" description="Clear or adjust the exact filters to review another part of the timeline." />
          )}
          {!filterError && eventsQuery.data && eventsQuery.data.items.length > 0 && (
            <ol className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {eventsQuery.data.items.map((event) => {
                const subjectDestination = securitySubjectDestination(event);
                return (
                  <li key={event.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">{humanize(event.eventType)}</span>
                          {event.ipAddress && <span className="break-all font-mono text-xs text-[var(--color-text-secondary)]">{event.ipAddress}</span>}
                        </div>
                        {metadataSummary(event.metadata).length > 0 && (
                          <ul className="mt-3 grid gap-1 text-xs text-[var(--color-text-secondary)] sm:grid-cols-2">
                            {metadataSummary(event.metadata).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                        {event.userId && (
                          <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
                            <p className="font-semibold text-[var(--color-text)]">
                              {securitySubjectLabel(event)} · {event.userName || event.userEmail || event.userId.slice(0, 8).toUpperCase()}
                            </p>
                            {event.userName && event.userEmail && (
                              <p className="mt-1 text-[var(--color-text-secondary)]">{event.userEmail}</p>
                            )}
                            <p className="mt-1 break-all font-mono text-[var(--color-text-tertiary)]">{event.userId}</p>
                            {subjectDestination && (
                              <Link
                                to={subjectDestination.to}
                                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)] hover:underline"
                              >
                                {subjectDestination.label}
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                      <time className="shrink-0 text-xs font-medium text-[var(--color-text-secondary)]" dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!filterError && eventsQuery.data && <PaginationControls pagination={eventsQuery.data.pagination} onPage={setEventPage} label="events" />}
        </Card>
      </section>

      <Dialog
        open={blockDialogOpen}
        onOpenChange={(open) => {
          setBlockDialogOpen(open);
          if (!open) {
            setBlockDraft(EMPTY_BLOCK);
            blockMutation.reset();
          }
        }}
      >
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (blockReady) blockMutation.mutate(blockDraft);
            }}
          >
            <DialogHeader>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Network access decision</p>
              <DialogTitle>Block an IP address</DialogTitle>
              <DialogDescription className="leading-6">
                Confirm the evidence first. Blocking a shared office, hotel, or carrier address can affect unrelated customers and providers.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="block-ip-address">IP address</Label>
              <Input
                id="block-ip-address"
                value={blockDraft.ipAddress}
                onChange={(event) => setBlockDraft((current) => ({ ...current, ipAddress: event.target.value }))}
                placeholder="203.0.113.10"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="block-duration">Duration</Label>
              <select
                id="block-duration"
                className="min-h-11 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                value={blockDraft.expiresInHours}
                onChange={(event) => setBlockDraft((current) => ({ ...current, expiresInHours: event.target.value }))}
              >
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="24">24 hours</option>
                <option value="72">3 days</option>
                <option value="168">7 days</option>
              </select>
            </div>
            <div>
              <Label htmlFor="block-audit-reason">Audit reason</Label>
              <Textarea
                id="block-audit-reason"
                rows={4}
                minLength={10}
                maxLength={500}
                value={blockDraft.reason}
                onChange={(event) => setBlockDraft((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Describe the failed attempts or security evidence"
                aria-describedby="block-audit-reason-guidance"
              />
              <p id="block-audit-reason-guidance" className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Minimum 10 characters. Saved to the security event timeline.
              </p>
            </div>
            {blockMutation.isError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {getErrorMessage(blockMutation.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={!blockReady || blockMutation.isPending}>
                {blockMutation.isPending ? 'Blocking…' : 'Confirm block'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unblockTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnblockTarget(null);
            setUnblockReason('');
            unblockMutation.reset();
          }
        }}
      >
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (unblockTarget && unblockReason.trim().length >= 10) {
                unblockMutation.mutate({ ipAddress: unblockTarget.ipAddress, reason: unblockReason });
              }
            }}
          >
            <DialogHeader>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Support review</p>
              <DialogTitle>Unblock {unblockTarget?.ipAddress}?</DialogTitle>
              <DialogDescription className="leading-6">
                Access resumes immediately. Failed-attempt evidence remains, and automatic detection can re-block this address within five minutes while it still meets the one-hour threshold.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="unblock-audit-reason">Audit reason</Label>
              <Textarea
                id="unblock-audit-reason"
                aria-label="Unblock audit reason"
                rows={4}
                minLength={10}
                maxLength={500}
                value={unblockReason}
                onChange={(event) => setUnblockReason(event.target.value)}
                placeholder="Explain the support evidence for restoring access"
                aria-describedby="unblock-audit-reason-guidance"
                autoFocus
              />
              <p id="unblock-audit-reason-guidance" className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Minimum 10 characters. Saved to the security event timeline.
              </p>
            </div>
            {unblockMutation.isError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {getErrorMessage(unblockMutation.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUnblockTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={unblockReason.trim().length < 10 || unblockMutation.isPending}>
                {unblockMutation.isPending ? 'Unblocking…' : 'Confirm unblock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
