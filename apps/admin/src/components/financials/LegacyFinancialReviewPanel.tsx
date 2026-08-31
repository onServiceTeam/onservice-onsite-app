import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Pagination,
  Textarea,
} from '@/components/ui';

const PAGE_SIZE = 25;
const CONFIRMATION = 'REVIEW LEGACY FINANCIAL TERMS';
const TIERS = ['founding', 'new', 'verified', 'pro', 'elite'] as const;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface QueueItem {
  bookingId: string;
  status: string;
  escrowStatus: string;
  customerId: string;
  customerName: string;
  providerId: string | null;
  providerName: string | null;
  currentProviderTier: string | null;
  categoryName: string;
  serviceName: string;
  servicePriceCentavos: number;
  serviceFeeCentavos: number;
  totalAmountCentavos: number;
  paymentMethod: string | null;
  bookingPaymentIntentId: string | null;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
}

interface EvidenceRow {
  id: string;
  amount?: number;
  type?: string;
  status?: string;
  payment_method?: string;
  paymongo_intent_id?: string | null;
  paymongo_payment_id?: string | null;
  reference_id?: string | null;
  wallet_type?: string;
  description?: string;
  quoted_price?: number;
  provider_name?: string | null;
  created_at: string;
}

interface ReviewDetail {
  booking: QueueItem;
  paymentIntents: EvidenceRow[];
  walletTransactions: EvidenceRow[];
  quotes: EvidenceRow[];
}

interface ReviewDraft {
  providerTier: string;
  commissionPercent: string;
  serviceFeePercent: string;
  serviceFeeMinPesos: string;
  serviceFeeMaxPesos: string;
  guaranteeFundPercent: string;
  over24HoursPercent: string;
  twoTo24HoursPercent: string;
  oneToTwoHoursPercent: string;
  thirtyMinutesToOneHourPercent: string;
  underThirtyMinutesPercent: string;
  providerArrivedPercent: string;
  customerNoShowPercent: string;
  evidenceReferences: string;
  evidenceNote: string;
  confirmation: string;
}

function emptyDraft(): ReviewDraft {
  return {
    providerTier: '', commissionPercent: '', serviceFeePercent: '', serviceFeeMinPesos: '',
    serviceFeeMaxPesos: '', guaranteeFundPercent: '', over24HoursPercent: '',
    twoTo24HoursPercent: '', oneToTwoHoursPercent: '', thirtyMinutesToOneHourPercent: '',
    underThirtyMinutesPercent: '', providerArrivedPercent: '', customerNoShowPercent: '',
    evidenceReferences: '', evidenceNote: '', confirmation: '',
  };
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function percentToBasisPoints(value: string): number {
  return Math.round(Number(value) * 100);
}

function pesosToCentavos(value: string): number {
  return Math.round(Number(value) * 100);
}

function policyPercentValid(value: string): boolean {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100
    && Math.round(number * 100) === number * 100;
}

function referenceLines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function evidenceLabel(row: EvidenceRow): string {
  return row.type ?? row.status ?? row.payment_method ?? 'record';
}

export function LegacyFinancialReviewPanel(): React.ReactElement {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(emptyDraft);

  const queueQ = useQuery({
    queryKey: ['legacy-financial-reviews', page, search],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<{ items: QueueItem[]; total: number }>>(
        '/api/v1/admin/financials/legacy-reviews',
        { params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search } },
      );
      return response.data.data;
    },
  });
  const detailQ = useQuery({
    queryKey: ['legacy-financial-review', selectedId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ReviewDetail>>(
        `/api/v1/admin/financials/legacy-reviews/${selectedId}`,
      );
      return response.data.data;
    },
    enabled: selectedId !== null,
  });

  const assigned = detailQ.data ? detailQ.data.booking.providerId !== null : false;
  const serviceFeeRateBasisPoints = percentToBasisPoints(draft.serviceFeePercent);
  const serviceFeeMinCentavos = pesosToCentavos(draft.serviceFeeMinPesos);
  const serviceFeeMaxCentavos = pesosToCentavos(draft.serviceFeeMaxPesos);
  const commissionRateBasisPoints = percentToBasisPoints(draft.commissionPercent);
  const guaranteeFundRateBasisPoints = percentToBasisPoints(draft.guaranteeFundPercent);
  const references = referenceLines(draft.evidenceReferences);
  const requiredFinancialFieldsPresent = [
    draft.serviceFeePercent,
    draft.serviceFeeMinPesos,
    draft.serviceFeeMaxPesos,
    draft.guaranteeFundPercent,
  ].every((value) => value.trim() !== '')
    && (!assigned || draft.commissionPercent.trim() !== '');
  const financialNumbersValid = requiredFinancialFieldsPresent && [
    serviceFeeRateBasisPoints, serviceFeeMinCentavos, serviceFeeMaxCentavos,
    guaranteeFundRateBasisPoints,
  ].every(Number.isSafeInteger)
    && serviceFeeRateBasisPoints >= 0 && serviceFeeRateBasisPoints <= 10000
    && serviceFeeMinCentavos >= 0 && serviceFeeMaxCentavos >= serviceFeeMinCentavos
    && guaranteeFundRateBasisPoints >= 0 && guaranteeFundRateBasisPoints <= 10000
    && (!assigned || (
      draft.providerTier !== ''
      && Number.isSafeInteger(commissionRateBasisPoints)
      && commissionRateBasisPoints >= 0
      && commissionRateBasisPoints <= 5000
    ));
  const policyValid = [
    draft.over24HoursPercent, draft.twoTo24HoursPercent, draft.oneToTwoHoursPercent,
    draft.thirtyMinutesToOneHourPercent, draft.underThirtyMinutesPercent,
    draft.providerArrivedPercent, draft.customerNoShowPercent,
  ].every(policyPercentValid);
  const canSubmit = isSuperAdmin && financialNumbersValid && policyValid
    && references.length >= 1 && references.length <= 20
    && draft.evidenceNote.trim().length >= 30 && draft.evidenceNote.trim().length <= 2000
    && draft.confirmation === CONFIRMATION;

  const allocation = useMemo(() => {
    const booking = detailQ.data?.booking;
    if (!booking || !financialNumbersValid) return null;
    const commission = assigned
      ? Math.round(booking.servicePriceCentavos * commissionRateBasisPoints / 10000)
      : null;
    const guarantee = Math.round(booking.serviceFeeCentavos * guaranteeFundRateBasisPoints / 10000);
    return {
      commission,
      providerReceives: commission === null ? null : booking.servicePriceCentavos - commission,
      guarantee,
      platformRetains: commission === null
        ? null
        : commission + booking.serviceFeeCentavos - guarantee,
      reproducedFee: serviceFeeRateBasisPoints === 0
        ? 0
        : Math.min(
          serviceFeeMaxCentavos,
          Math.max(
            serviceFeeMinCentavos,
            Math.round(booking.servicePriceCentavos * serviceFeeRateBasisPoints / 10000),
          ),
        ),
    };
  }, [
    assigned, commissionRateBasisPoints, detailQ.data?.booking, financialNumbersValid,
    guaranteeFundRateBasisPoints, serviceFeeMaxCentavos, serviceFeeMinCentavos,
    serviceFeeRateBasisPoints,
  ]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      return api.post(`/api/v1/admin/financials/legacy-reviews/${selectedId}/complete`, {
        providerTier: assigned ? draft.providerTier : undefined,
        commissionRateBasisPoints: assigned ? commissionRateBasisPoints : undefined,
        serviceFeeRateBasisPoints,
        serviceFeeMinCentavos,
        serviceFeeMaxCentavos,
        guaranteeFundRateBasisPoints,
        cancellationPolicy: {
          over24HoursPercent: Number(draft.over24HoursPercent),
          twoTo24HoursPercent: Number(draft.twoTo24HoursPercent),
          oneToTwoHoursPercent: Number(draft.oneToTwoHoursPercent),
          thirtyMinutesToOneHourPercent: Number(draft.thirtyMinutesToOneHourPercent),
          underThirtyMinutesPercent: Number(draft.underThirtyMinutesPercent),
          providerArrivedPercent: Number(draft.providerArrivedPercent),
          customerNoShowPercent: Number(draft.customerNoShowPercent),
        },
        evidenceReferences: references,
        evidenceNote: draft.evidenceNote.trim(),
        confirmation: draft.confirmation,
      });
    },
    onSuccess: () => {
      toast.success('Legacy financial terms recorded. The evidence remains immutable.');
      setSelectedId(null);
      setDraft(emptyDraft());
      void queryClient.invalidateQueries({ queryKey: ['legacy-financial-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['fin-escrow'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openReview = (bookingId: string): void => {
    setDraft(emptyDraft());
    setSelectedId(bookingId);
  };
  const totalPages = Math.ceil((queueQ.data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-semibold">Held money blocked pending historical evidence</h2>
        <p className="mt-1">
          These paid bookings predate immutable financial terms. Do not copy today&apos;s rates.
          Review the original payment, pricing policy, provider agreement, and cancellation policy.
          Completion creates booking-only evidence and never changes a future commission schedule.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="legacy-review-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="legacy-review-title" className="text-base font-semibold text-[var(--color-text)]">Legacy held-booking queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Oldest held transactions appear first. Release remains blocked until review completes.</p>
          </div>
          {queueQ.data && <Badge label={`${queueQ.data.total} REQUIRE REVIEW`} variant={queueQ.data.total > 0 ? 'warning' : 'success'} />}
        </div>

        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Booking ID, customer, provider, or email" className="sm:max-w-md" />
          <Button type="submit" variant="outline">Search queue</Button>
        </form>

        {queueQ.isLoading ? <LoadingState label="Loading legacy financial reviews…" /> : queueQ.isError ? (
          <ErrorState title="Legacy review queue unavailable" description={getErrorMessage(queueQ.error)} action={<Button variant="outline" onClick={() => { void queueQ.refetch(); }}>Retry</Button>} />
        ) : !queueQ.data || queueQ.data.items.length === 0 ? (
          <EmptyState title="No held bookings awaiting review" description={search ? 'No queue item matches this search.' : 'Every held booking has immutable financial terms.'} />
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead><tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Booking / age</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Customer</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Provider</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">Service</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[var(--color-text-secondary)]">Customer total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-text-secondary)]">State</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-[var(--color-text-secondary)]">Action</th>
                </tr></thead>
                <tbody>{queueQ.data.items.map((item) => (
                  <tr key={item.bookingId} className="border-b border-[var(--color-border)] align-top hover:bg-slate-50">
                    <td className="px-3 py-3"><Link to={`/bookings/${item.bookingId}`} className="font-medium text-[var(--color-primary)] hover:underline">{item.bookingId.slice(0, 8)}</Link><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Paid record from {formatDateTime(item.createdAt)}</p></td>
                    <td className="px-3 py-3">{item.customerName}</td>
                    <td className="px-3 py-3">{item.providerName ?? 'Unassigned'}<p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">Current tier: {item.currentProviderTier ?? 'none'}</p></td>
                    <td className="px-3 py-3">{item.serviceName}<p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.categoryName}</p></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatCurrency(item.totalAmountCentavos)}</td>
                    <td className="px-3 py-3"><Badge label={item.escrowStatus.toUpperCase()} variant="warning" /><p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">{item.status.replace(/_/g, ' ')}</p></td>
                    <td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openReview(item.bookingId)}>{isSuperAdmin ? 'Review evidence' : 'Inspect evidence'}</Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {totalPages > 1 && <Pagination page={page} pageSize={PAGE_SIZE} total={queueQ.data.total} totalPages={totalPages} onPageChange={setPage} />}
          </>
        )}
      </section>

      <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review immutable financial evidence</DialogTitle>
            <DialogDescription>Nothing entered here changes the customer charge. Unsupported assumptions must not be approved.</DialogDescription>
          </DialogHeader>
          {detailQ.isLoading ? <LoadingState label="Loading transaction evidence…" /> : detailQ.isError || !detailQ.data ? (
            <ErrorState title="Transaction evidence unavailable" description={getErrorMessage(detailQ.error)} action={<Button variant="outline" onClick={() => { void detailQ.refetch(); }}>Retry</Button>} />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border)] bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs uppercase text-[var(--color-text-secondary)]">Service price</p><p className="font-semibold">{formatCurrency(detailQ.data.booking.servicePriceCentavos)}</p></div>
                <div><p className="text-xs uppercase text-[var(--color-text-secondary)]">Service fee</p><p className="font-semibold">{formatCurrency(detailQ.data.booking.serviceFeeCentavos)}</p></div>
                <div><p className="text-xs uppercase text-[var(--color-text-secondary)]">Customer total</p><p className="font-semibold">{formatCurrency(detailQ.data.booking.totalAmountCentavos)}</p></div>
                <div><p className="text-xs uppercase text-[var(--color-text-secondary)]">Provider at review</p><p className="font-semibold">{detailQ.data.booking.providerName ?? 'Unassigned'}</p></div>
              </div>

              <section>
                <h3 className="text-sm font-semibold">Recorded transaction evidence</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {[
                    ['Payment intents', detailQ.data.paymentIntents],
                    ['Wallet ledger', detailQ.data.walletTransactions],
                    ['Quote history', detailQ.data.quotes],
                  ].map(([title, rows]) => (
                    <div key={String(title)} className="rounded-lg border border-[var(--color-border)] p-3">
                      <p className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">{String(title)}</p>
                      {(rows as EvidenceRow[]).length === 0 ? <p className="mt-2 text-xs text-[var(--color-text-secondary)]">No records</p> : (
                        <ul className="mt-2 space-y-2">{(rows as EvidenceRow[]).map((row) => (
                          <li key={row.id} className="border-b border-slate-100 pb-2 text-xs last:border-0">
                            <p className="font-medium capitalize">{evidenceLabel(row).replace(/_/g, ' ')}</p>
                            <p className="text-[var(--color-text-secondary)]">{row.amount != null ? formatCurrency(Number(row.amount)) : row.quoted_price != null ? formatCurrency(Number(row.quoted_price)) : 'No amount'} · {formatDateTime(row.created_at)}</p>
                            <p className="break-all text-[var(--color-text-secondary)]">{row.paymongo_intent_id ?? row.paymongo_payment_id ?? row.reference_id ?? row.id}</p>
                          </li>
                        ))}</ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {!isSuperAdmin ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">You may inspect evidence, but only a super admin can approve historical financial terms.</div>
              ) : (
                <>
                  <section>
                    <h3 className="text-sm font-semibold">Historical pricing and provider agreement</h3>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Enter values only when the cited evidence supports them. The fee settings must reproduce {formatCurrency(detailQ.data.booking.serviceFeeCentavos)} exactly.</p>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {assigned && <><div><Label htmlFor="legacy-tier">Historical provider tier</Label><select id="legacy-tier" value={draft.providerTier} onChange={(event) => setDraft((current) => ({ ...current, providerTier: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Select from evidence</option>{TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Current tier is {detailQ.data.booking.currentProviderTier}; this is not proof of the old tier.</p></div><PercentField id="legacy-commission" label="Historical commission (%)" value={draft.commissionPercent} onChange={(value) => setDraft((current) => ({ ...current, commissionPercent: value }))} max={50} /></>}
                      <PercentField id="legacy-service-fee" label="Service fee rate (%)" value={draft.serviceFeePercent} onChange={(value) => setDraft((current) => ({ ...current, serviceFeePercent: value }))} />
                      <MoneyField id="legacy-fee-min" label="Service fee minimum (PHP)" value={draft.serviceFeeMinPesos} onChange={(value) => setDraft((current) => ({ ...current, serviceFeeMinPesos: value }))} />
                      <MoneyField id="legacy-fee-max" label="Service fee maximum (PHP)" value={draft.serviceFeeMaxPesos} onChange={(value) => setDraft((current) => ({ ...current, serviceFeeMaxPesos: value }))} />
                      <PercentField id="legacy-guarantee" label="Guarantee fund rate (%)" value={draft.guaranteeFundPercent} onChange={(value) => setDraft((current) => ({ ...current, guaranteeFundPercent: value }))} />
                    </div>
                    {allocation && <div className={`mt-4 rounded-lg border p-3 text-sm ${allocation.reproducedFee === detailQ.data.booking.serviceFeeCentavos ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}><p className="font-semibold">Fee reproduced: {formatCurrency(allocation.reproducedFee)} {allocation.reproducedFee === detailQ.data.booking.serviceFeeCentavos ? '(matches recorded fee)' : `does not match ${formatCurrency(detailQ.data.booking.serviceFeeCentavos)}`}</p>{allocation.commission !== null && <p className="mt-1">Commission {formatCurrency(allocation.commission)} · provider receives {formatCurrency(allocation.providerReceives ?? 0)} · platform retains {formatCurrency(allocation.platformRetains ?? 0)} · guarantee {formatCurrency(allocation.guarantee)}</p>}</div>}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">Historical cancellation refund percentages</h3>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <PolicyField id="legacy-over24" label="Over 24 hours" value={draft.over24HoursPercent} onChange={(value) => setDraft((current) => ({ ...current, over24HoursPercent: value }))} />
                      <PolicyField id="legacy-2to24" label="2 to 24 hours" value={draft.twoTo24HoursPercent} onChange={(value) => setDraft((current) => ({ ...current, twoTo24HoursPercent: value }))} />
                      <PolicyField id="legacy-1to2" label="1 to 2 hours" value={draft.oneToTwoHoursPercent} onChange={(value) => setDraft((current) => ({ ...current, oneToTwoHoursPercent: value }))} />
                      <PolicyField id="legacy-30to60" label="30 to 60 minutes" value={draft.thirtyMinutesToOneHourPercent} onChange={(value) => setDraft((current) => ({ ...current, thirtyMinutesToOneHourPercent: value }))} />
                      <PolicyField id="legacy-under30" label="Under 30 minutes" value={draft.underThirtyMinutesPercent} onChange={(value) => setDraft((current) => ({ ...current, underThirtyMinutesPercent: value }))} />
                      <PolicyField id="legacy-arrived" label="Provider arrived" value={draft.providerArrivedPercent} onChange={(value) => setDraft((current) => ({ ...current, providerArrivedPercent: value }))} />
                      <PolicyField id="legacy-no-show" label="Customer no-show" value={draft.customerNoShowPercent} onChange={(value) => setDraft((current) => ({ ...current, customerNoShowPercent: value }))} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div><Label htmlFor="legacy-references">Evidence references, one per line</Label><Textarea id="legacy-references" rows={4} value={draft.evidenceReferences} onChange={(event) => setDraft((current) => ({ ...current, evidenceReferences: event.target.value }))} placeholder="payment-intent: pi_...&#10;provider agreement: signed archive record ..." className="mt-1" /><p className="mt-1 text-xs text-[var(--color-text-secondary)]">{references.length} / 20 references</p></div>
                    <div><Label htmlFor="legacy-note">Review note (30 to 2000 characters)</Label><Textarea id="legacy-note" rows={4} maxLength={2000} value={draft.evidenceNote} onChange={(event) => setDraft((current) => ({ ...current, evidenceNote: event.target.value }))} placeholder="Explain what was checked, where it came from, and why each historical value is supported." className="mt-1" /></div>
                    <div><Label htmlFor="legacy-confirmation">Type {CONFIRMATION}</Label><Input id="legacy-confirmation" value={draft.confirmation} onChange={(event) => setDraft((current) => ({ ...current, confirmation: event.target.value }))} className="mt-1" /></div>
                  </section>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
            {isSuperAdmin && detailQ.data && <Button disabled={!canSubmit || allocation?.reproducedFee !== detailQ.data.booking.serviceFeeCentavos || submitMutation.isPending} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? 'Recording immutable evidence…' : 'Complete reviewed terms'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PercentField({ id, label, value, onChange, max = 100 }: { id: string; label: string; value: string; onChange: (value: string) => void; max?: number }): React.ReactElement {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min={0} max={max} step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1" /></div>;
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }): React.ReactElement {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min={0} step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1" /></div>;
}

function PolicyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }): React.ReactElement {
  return <PercentField id={id} label={`${label} refund (%)`} value={value} onChange={onChange} />;
}
