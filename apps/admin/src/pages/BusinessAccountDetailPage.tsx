/**
 * Business Account 360 admin detail page.
 *
 * 5 tabs: Overview, Members, Contracts, Bookings, Invoices.
 * Mirrors the structure of CustomerDetailPage.tsx (Phase 06):
 * useParams id, react-query data fetch, tabbed layout, Card/KpiCard,
 * loading/error/empty states, super-admin gating via useAuthStore.
 *
 * Backend endpoints (all under the api client base, all return
 * { success, data, [pagination] }):
 *   GET  /api/v1/admin/business-accounts/:id
 *   GET  /api/v1/admin/business-accounts/:id/members
 *   GET  /api/v1/admin/business-accounts/:id/contracts?page&pageSize
 *   GET  /api/v1/admin/business-accounts/:id/invoices?page&pageSize
 *   POST /api/v1/admin/business-accounts/:id/terms/preview + /terms/publish
 *   POST /api/v1/admin/business-accounts/:id/assign-manager
 *   POST /api/v1/admin/business-accounts/:id/invoices/preview + /prepare
 *   POST /api/v1/admin/invoices/:id/finalize + /payments + /adjustments
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  UserCheck,
  Coins,
  CreditCard,
  Check,
  X,
} from '@/components/icons';
import api, { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import { useAuthStore } from '@/stores/auth.store';

// ─── Types ───────────────────────────────────────────────────────────────

interface BusinessAccount {
  id: string;
  companyName: string;
  businessType: string;
  registrationNumber: string | null;
  taxId: string | null;
  billingAddress: string | null;
  barangay: string | null;
  city: string;
  province: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  accountManagerId: string | null;
  accountManagerName?: string | null;
  accountManagerEmail?: string | null;
  accountManagerRole?: string | null;
  accountManagerIsActive?: boolean | null;
  accountManagerProfileId?: string | null;
  accountManagerProfileName?: string | null;
  accountManagerProfileIsActive?: boolean | null;
  ownerUserId: string | null;
  ownerName?: string | null;
  status: string;
  paymentTerms: string;
  volumeDiscountRate: number; // percent number
  monthlyCreditLimit: number | null; // centavos
  notes: string | null;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface BusinessMember {
  id: string;
  userId: string;
  role: string;
  canBook: boolean;
  canApprove: boolean;
  canViewInvoices: boolean;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string;
}

interface BusinessContract {
  id: string;
  categoryId: string;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  providerId: string | null;
  providerName: string | null;
  contractType: string;
  frequency: string | null;
  agreedRate: number | null; // centavos
  discountPercentage: number; // percent
  estimatedMonthlyValue: number | null; // centavos
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: string;
  recordVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishReason: string | null;
  createdAt: string;
}

interface BusinessInvoice {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number; // centavos
  discountAmount: number; // centavos
  taxAmount: number; // centavos
  totalAmount: number; // centavos
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  recordVersion: number;
  controlState: string;
  settlementState?: string;
  documentKind: string;
  currency: string;
  accountTermsVersionId: string | null;
  preparationPreviewId: string | null;
  preparedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

interface BusinessControlPreview {
  id: string;
  action: string;
  impact: Record<string, number>;
  proposedTerms?: {
    paymentTerms: string;
    volumeDiscountRate: number;
    monthlyCreditLimit: number;
    currency: string;
    effectiveFrom: string;
  };
  expiresAt: string;
  createdAt: string;
}

interface CurrentBusinessTerms {
  id: string;
  version: number;
  paymentTerms: string;
  volumeDiscountRate: number;
  monthlyCreditLimit: number;
  currency: string;
  effectiveFrom: string;
  reason: string;
}

interface InvoiceBalance {
  adjustmentTotal: number;
  paymentTotal: number;
  adjustedTotal: number;
  balanceDue: number;
}

interface InvoiceAdjustmentEvidence {
  id: string;
  adjustmentType: string;
  amount: number;
  currency: string;
  reason: string;
  evidenceReference: string;
  createdAt: string;
}

interface InvoicePaymentEvidence {
  id: string;
  entryType: 'payment' | 'reversal';
  reversesPaymentId: string | null;
  amount: number;
  currency: string;
  method: string;
  effectiveAt: string;
  externalReference: string;
  evidenceReference: string;
  reason: string;
  classification: string;
  createdAt: string;
}

interface InvoicePreview {
  id: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  groups: Array<{
    accountTermsVersionId: string;
    paymentTerms: string;
    volumeDiscountBasisPoints: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    manifestHash: string;
    items: Array<{ bookingId: string; description: string; amount: number }>;
  }>;
  exceptions: Array<{ bookingId: string; code: string; message: string; blocking: true }>;
  expiresAt: string;
}

interface BusinessBooking {
  id: string;
  customerId: string;
  customerName: string;
  providerId: string | null;
  providerName: string | null;
  categoryName: string;
  status: string;
  escrowStatus: string;
  totalAmount: number;
  scheduledAt: string | null;
  createdAt: string;
  contractId: string | null;
  contractType: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  openSupportTickets: number;
  openDisputes: number;
}

interface BusinessInvoiceItem {
  id: string;
  bookingId: string | null;
  contractId: string | null;
  description: string;
  serviceDate: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
  bookingStatus: string | null;
  customerId: string | null;
  customerName: string | null;
  providerId: string | null;
  providerName: string | null;
  serviceName: string | null;
}

interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  pagination: PageInfo;
}

interface AdminStaffOption {
  id: string;
  user_id: string;
  is_active: boolean;
  account_is_active?: boolean;
  account_role?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
  role_name?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

type TabId = 'overview' | 'members' | 'contracts' | 'bookings' | 'invoices';

const BUSINESS_ACCOUNT_TABS: readonly TabId[] = [
  'overview', 'members', 'contracts', 'bookings', 'invoices',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTab(value: string | null): TabId {
  return BUSINESS_ACCOUNT_TABS.includes(value as TabId) ? value as TabId : 'overview';
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'danger',
  closed: 'default',
};

const INVOICE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  paid: 'success',
  pending: 'warning',
  sent: 'info',
  overdue: 'danger',
  cancelled: 'default',
  void: 'default',
};

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'default' | 'info' {
  return STATUS_VARIANT[s] ?? 'info';
}

function fmtLabel(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPercent(pct: number): string {
  return `${pct}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function fmtDateTime(iso: string | null, fallback: string): string {
  return new Date(iso ?? fallback).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function memberName(m: BusinessMember): string {
  const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
  return name.length > 0 ? name : '—';
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function BusinessAccountDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const accountId = id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const requestedContractId = searchParams.get('contractId');
  const requestedInvoiceId = searchParams.get('invoiceId');
  const selectedContractId = tab === 'contracts' && requestedContractId && UUID_PATTERN.test(requestedContractId)
    ? requestedContractId
    : null;
  const selectedInvoiceId = tab === 'invoices' && requestedInvoiceId && UUID_PATTERN.test(requestedInvoiceId)
    ? requestedInvoiceId
    : null;

  function setTab(nextTab: TabId): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextTab === 'overview') params.delete('tab');
      else params.set('tab', nextTab);
      if (nextTab !== 'contracts') params.delete('contractId');
      if (nextTab !== 'invoices') params.delete('invoiceId');
      return params;
    });
  }

  function setSelectedContractId(contractId: string | null): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', 'contracts');
      params.delete('invoiceId');
      if (contractId) params.set('contractId', contractId);
      else params.delete('contractId');
      return params;
    });
  }

  function setSelectedInvoiceId(invoiceId: string | null): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', 'invoices');
      params.delete('contractId');
      if (invoiceId) params.set('invoiceId', invoiceId);
      else params.delete('invoiceId');
      return params;
    });
  }

  const accountQuery = useQuery({
    queryKey: ['admin-business-account', accountId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BusinessAccount }>(
        `/api/v1/admin/business-accounts/${accountId}`,
      );
      return res.data.data;
    },
    enabled: !!accountId,
  });

  if (!accountId) {
    return <ErrorState title="Invalid URL" description="Business account ID is missing." />;
  }

  if (accountQuery.isLoading) return <LoadingState />;
  if (accountQuery.isError || !accountQuery.data) {
    return (
      <ErrorState
        title="Failed to load business account"
        description={getErrorMessage(accountQuery.error)}
        action={
          <Link to="/business-accounts">
            <Button variant="secondary" size="sm">
              <ArrowLeft size={14} /> Back to business accounts
            </Button>
          </Link>
        }
      />
    );
  }

  const account = accountQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/business-accounts"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> Back to business accounts
        </Link>
      </div>

      <AccountHeader account={account} />
      <AccountLifecycleControl account={account} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
          <TabsTrigger className="min-h-11" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="min-h-11" value="members">Members</TabsTrigger>
          <TabsTrigger className="min-h-11" value="contracts">Contracts</TabsTrigger>
          <TabsTrigger className="min-h-11" value="bookings">Bookings &amp; support</TabsTrigger>
          <TabsTrigger className="min-h-11" value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab account={account} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab accountId={accountId} />
        </TabsContent>
        <TabsContent value="contracts">
          <ContractsTab
            accountId={accountId}
            selectedContractId={selectedContractId}
            onSelectedContractChange={setSelectedContractId}
          />
        </TabsContent>
        <TabsContent value="bookings">
          <BusinessBookingsTab
            accountId={accountId}
            accountName={account.companyName}
            ownerUserId={account.ownerUserId}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab
            accountId={accountId}
            selectedInvoiceId={selectedInvoiceId}
            onSelectedInvoiceChange={setSelectedInvoiceId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function AccountHeader({ account }: { account: BusinessAccount }): React.ReactElement {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="w-16 h-16 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center">
          <Building2 size={26} className="text-[var(--color-text-secondary)]" />
        </div>

        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{account.companyName}</h1>
            <Badge label={fmtLabel(account.status)} variant={statusVariant(account.status)} />
            <Badge label={fmtLabel(account.businessType)} variant="info" />
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-secondary)] flex-wrap">
            <span className="inline-flex items-center gap-1">
              <User size={14} /> {account.contactPerson}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={14} /> {account.contactPhone}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail size={14} /> {account.contactEmail}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} /> joined {fmtDate(account.createdAt)}
            </span>
          </div>
        </div>
      </div>

    </Card>
  );
}

function ImpactSummary({ impact }: { impact: Record<string, number> }): React.ReactElement {
  const entries = Object.entries(impact);
  if (entries.length === 0) return <p className="text-sm text-[var(--color-text-secondary)]">No linked records are affected.</p>;
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--color-border)] bg-slate-50 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{fmtLabel(key)}</dt>
          <dd className="mt-1 text-lg font-semibold text-[var(--color-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AccountLifecycleControl({ account }: { account: BusinessAccount }): React.ReactElement {
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<BusinessControlPreview | null>(null);
  const [action, setAction] = useState<'approve' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');

  const previewMutation = useMutation({
    mutationFn: async (nextAction: 'approve' | 'suspend') => {
      const response = await api.post<{ success: boolean; data: BusinessControlPreview }>(
        `/api/v1/admin/business-accounts/${account.id}/${nextAction}/preview`,
      );
      return { nextAction, preview: response.data.data };
    },
    onSuccess: ({ nextAction, preview: nextPreview }) => {
      setAction(nextAction);
      setPreview(nextPreview);
      setReason('');
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!action || !preview) throw new Error('Run the impact preview first.');
      await api.post(`/api/v1/admin/business-accounts/${account.id}/${action}`, {
        previewId: preview.id,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account', account.id] });
      void queryClient.invalidateQueries({ queryKey: ['adminBusinessAccounts'] });
      setPreview(null);
      setAction(null);
      setReason('');
    },
  });

  if (!['pending', 'active'].includes(account.status)) return <></>;

  return (
    <Card className="border-l-4 border-l-[var(--color-primary)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Lifecycle control</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--color-text)]">
            {account.status === 'pending' ? 'Account approval is waiting for impact review' : 'Account is active'}
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-[var(--color-text-secondary)]">
            The preview snapshots linked contracts, work orders, and statements. The final decision requires a reason and fails if anything changes before approval.
          </p>
        </div>
        {isSuperAdmin ? (
          <Button
            variant={account.status === 'active' ? 'destructive' : 'default'}
            size="sm"
            onClick={() => previewMutation.mutate(account.status === 'pending' ? 'approve' : 'suspend')}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? 'Reviewing…' : account.status === 'pending' ? 'Review approval' : 'Review suspension'}
          </Button>
        ) : (
          <Badge label="Super admin decision" variant="warning" />
        )}
      </div>
      {previewMutation.isError ? <p role="alert" className="mt-3 text-sm text-red-600">{getErrorMessage(previewMutation.error)}</p> : null}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && !applyMutation.isPending && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === 'approve' ? 'Approve business account' : 'Suspend business account'}</DialogTitle>
            <DialogDescription>
              Review the current impact snapshot. Historical work and statements remain unchanged.
            </DialogDescription>
          </DialogHeader>
          {preview ? <ImpactSummary impact={preview.impact} /> : null}
          <div className="space-y-2">
            <Label htmlFor="business-lifecycle-reason">Decision reason</Label>
            <textarea
              id="business-lifecycle-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="Explain the reviewed business reason (minimum 10 characters)"
            />
          </div>
          {applyMutation.isError ? <p role="alert" className="text-sm text-red-600">{getErrorMessage(applyMutation.error)}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={applyMutation.isPending}>Cancel</Button>
            <Button
              variant={action === 'suspend' ? 'destructive' : 'default'}
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending || reason.trim().length < 10}
            >
              {applyMutation.isPending ? 'Applying…' : action === 'approve' ? 'Approve account' : 'Suspend account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────

export function OverviewTab({ account }: { account: BusinessAccount }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">
        Account projection values are intake/current mirror fields, not approval evidence. The versioned commercial terms panel below is the authority for future company bookings.
      </div>
      <KpiCard
        title="Account projection: volume discount"
        value={account.volumeDiscountRate > 0 ? fmtPercent(account.volumeDiscountRate) : '—'}
        icon={<Coins size={16} />}
      />
      <KpiCard
        title="Account projection: billing credit"
        value={account.monthlyCreditLimit && account.monthlyCreditLimit > 0 ? formatCurrency(account.monthlyCreditLimit) : '—'}
        icon={<CreditCard size={16} />}
      />

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Account information</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow label="Business type" value={fmtLabel(account.businessType)} />
          <InfoRow label="Projected payment terms" value={fmtLabel(account.paymentTerms)} />
          <InfoRow label="Registration #" value={account.registrationNumber ?? '—'} />
          <InfoRow label="Tax ID" value={account.taxId ?? '—'} />
          <InfoRow label="Business owner" value={account.ownerName ?? account.ownerUserId ?? '—'} />
          <InfoRow label="Account manager" value={account.accountManagerName ?? (account.accountManagerId ? 'Assigned account unavailable' : 'Unassigned')} />
          {account.accountManagerId && <InfoRow label="Manager account role" value={fmtLabel(account.accountManagerRole ?? 'Unknown')} />}
          {account.accountManagerId && <InfoRow label="Manager account status" value={account.accountManagerIsActive ? 'Active' : 'Inactive'} />}
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <MapPin size={14} /> Billing address
        </h3>
        <div className="text-sm text-[var(--color-text-secondary)] space-y-1">
          <p>{account.billingAddress ?? '—'}</p>
          <p>
            {[account.barangay, account.city, account.province].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        {account.notes && (
          <>
            <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Notes</h3>
            <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{account.notes}</p>
          </>
        )}
      </Card>

      <div className="md:col-span-2">
        <BillingSettingsCard account={account} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className={`text-[var(--color-text)] text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

// ─── Billing settings + assign manager ─────────────────────────────────────

export function BillingSettingsCard({ account }: { account: BusinessAccount }): React.ReactElement {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();

  // The account projection is display-only. Every commercial change is first
  // previewed, then published as a new immutable terms version.
  const [paymentTerms, setPaymentTerms] = useState(account.paymentTerms);
  const [discountPct, setDiscountPct] = useState(String(account.volumeDiscountRate ?? ''));
  const [creditLimitPesos, setCreditLimitPesos] = useState(
    account.monthlyCreditLimit != null ? String(account.monthlyCreditLimit / 100) : '',
  );
  const [managerId, setManagerId] = useState(account.accountManagerId ?? '');
  const [managerReason, setManagerReason] = useState('');
  const [termsPreview, setTermsPreview] = useState<BusinessControlPreview | null>(null);
  const [termsReason, setTermsReason] = useState('');

  useEffect(() => {
    setPaymentTerms(account.paymentTerms);
    setDiscountPct(String(account.volumeDiscountRate ?? ''));
    setCreditLimitPesos(account.monthlyCreditLimit != null ? String(account.monthlyCreditLimit / 100) : '');
  }, [account.paymentTerms, account.volumeDiscountRate, account.monthlyCreditLimit]);

  const termsQuery = useQuery({
    queryKey: ['admin-business-account-current-terms', account.id],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: CurrentBusinessTerms | null }>(
        `/api/v1/admin/business-accounts/${account.id}/terms/current`,
      );
      return response.data.data;
    },
  });

  const managersQuery = useQuery({
    queryKey: ['adminStaff', 'active-manager-options'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff?page=1&limit=100&profileActive=true&accountActive=true');
      return (res.data.data ?? []) as AdminStaffOption[];
    },
    enabled: isSuperAdmin,
  });

  const previewTerms = useMutation({
    mutationFn: async (input: {
      expectedVersion: number;
      paymentTerms: string;
      volumeDiscountRate: number;
      monthlyCreditLimit: number;
    }) => {
      const response = await api.post<{ success: boolean; data: BusinessControlPreview }>(
        `/api/v1/admin/business-accounts/${account.id}/terms/preview`,
        input,
      );
      return response.data.data;
    },
    onSuccess: (nextPreview) => {
      setTermsPreview(nextPreview);
      setTermsReason('');
    },
  });

  const publishTerms = useMutation({
    mutationFn: async () => {
      if (!termsPreview) throw new Error('Run the terms preview first.');
      await api.post(`/api/v1/admin/business-accounts/${account.id}/terms/publish`, {
        previewId: termsPreview.id,
        reason: termsReason.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account', account.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account-current-terms', account.id] });
      setTermsPreview(null);
      setTermsReason('');
    },
  });

  const assignManager = useMutation({
    mutationFn: async (input: { accountManagerId: string; reason: string }) => {
      const res = await api.post<{ success: boolean; data: BusinessAccount }>(
        `/api/v1/admin/business-accounts/${account.id}/assign-manager`,
        input,
      );
      return res.data.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-business-account', account.id] });
      setManagerId(updated.accountManagerId ?? '');
      setManagerReason('');
    },
  });

  const parsedPct = Number(discountPct);
  const pctValid = discountPct.trim() !== ''
    && Number.isFinite(parsedPct)
    && parsedPct >= 0
    && parsedPct <= 50
    && Math.abs(Math.round(parsedPct * 100) / 100 - parsedPct) < 0.000001;

  const parsedPesos = Number(creditLimitPesos);
  const creditValid =
    creditLimitPesos.trim() === '' ||
    (Number.isFinite(parsedPesos)
      && parsedPesos >= 0
      && Number.isSafeInteger(Math.round(parsedPesos * 100)));

  function submitBilling(): void {
    if (!pctValid || !creditValid || creditLimitPesos.trim() === '') return;
    previewTerms.mutate({
      expectedVersion: account.recordVersion,
      paymentTerms,
      volumeDiscountRate: parsedPct,
      monthlyCreditLimit: Math.round(parsedPesos * 100),
    });
  }

  if (!isSuperAdmin) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">Billing settings</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Commercial terms publication and account-manager changes require a super admin. Current terms remain visible above.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">Versioned commercial terms</h3>
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
          New terms affect only future company bookings. Existing bookings, statements, payments, and adjustments keep their original snapshots.
        </p>
        <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 text-sm">
          {termsQuery.isLoading ? <span>Loading approved terms…</span> : termsQuery.data ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <InfoRow label="Terms version" value={`v${termsQuery.data.version}`} />
              <InfoRow label="Payment terms" value={fmtLabel(termsQuery.data.paymentTerms)} />
              <InfoRow label="Discount" value={fmtPercent(termsQuery.data.volumeDiscountRate)} />
              <InfoRow label="Approved billing credit" value={formatCurrency(termsQuery.data.monthlyCreditLimit)} />
            </div>
          ) : <span className="font-medium text-amber-700">No approved terms version. Publish terms before publishing a contract.</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="ba-payment-terms" className="text-xs text-[var(--color-text-secondary)]">Payment terms</label>
            <select
              id="ba-payment-terms"
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <option value="net_15">Net 15</option>
              <option value="net_30">Net 30</option>
              <option value="net_60">Net 60</option>
            </select>
          </div>
          <div>
            <label htmlFor="ba-discount-pct" className="text-xs text-[var(--color-text-secondary)]">
              Volume discount (%) — 0 to 50, up to 2 decimals
            </label>
            <input
              id="ba-discount-pct"
              type="number"
              step="0.01"
              min="0"
              max="50"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              placeholder="10"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="ba-credit-limit" className="text-xs text-[var(--color-text-secondary)]">
              Approved billing credit (PHP)
            </label>
            <input
              id="ba-credit-limit"
              type="number"
              step="0.01"
              min="0"
              value={creditLimitPesos}
              onChange={(e) => setCreditLimitPesos(e.target.value)}
              placeholder="50000.00"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={
              previewTerms.isPending
              || account.status !== 'active'
              || !pctValid
              || !creditValid
              || creditLimitPesos.trim() === ''
            }
            onClick={submitBilling}
          >
            {previewTerms.isPending ? 'Preparing preview…' : 'Preview new terms'}
          </Button>
          {!pctValid && discountPct.trim() !== '' && (
            <span className="text-xs text-amber-600">Discount must be 0–50% with at most two decimals.</span>
          )}
          {!creditValid && (
            <span className="text-xs text-amber-600">Billing credit must be a non-negative amount.</span>
          )}
          {account.status !== 'active' ? <span className="text-xs text-amber-700">Activate the account before publishing terms.</span> : null}
          {previewTerms.isError ? <span role="alert" className="text-xs text-red-600">{getErrorMessage(previewTerms.error)}</span> : null}
          {publishTerms.isSuccess ? <span className="text-xs text-green-600">A new immutable terms version was published.</span> : null}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <UserCheck size={14} /> Assign account manager
        </h3>
        <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Current relationship owner</p>
          {account.accountManagerId ? (
            <>
              <p className="mt-1 font-semibold text-[var(--color-text)]">{account.accountManagerName ?? account.accountManagerEmail ?? 'Assigned account unavailable'}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {fmtLabel(account.accountManagerRole ?? 'Unknown role')} account · {account.accountManagerIsActive ? 'active' : 'inactive'}
                {' · '}{account.accountManagerProfileId
                  ? `${fmtLabel(account.accountManagerProfileName ?? 'Unknown')} profile ${account.accountManagerProfileIsActive ? 'active' : 'inactive'}`
                  : 'no directory profile'}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                <Link to={`/staff?search=${encodeURIComponent(account.accountManagerEmail ?? account.accountManagerName ?? '')}`} className="text-[var(--color-primary)] hover:underline">Open staff account</Link>
                <Link to={`/support-tickets?assignedAgentId=${encodeURIComponent(account.accountManagerId)}&active=1&agentName=${encodeURIComponent(account.accountManagerName ?? account.accountManagerEmail ?? 'Account manager')}`} className="text-[var(--color-primary)] hover:underline">Open owned support cases</Link>
                <Link to={`/audit-log?entityType=business_account&entityId=${encodeURIComponent(account.id)}`} className="text-[var(--color-primary)] hover:underline">Assignment audit</Link>
              </div>
            </>
          ) : (
            <p className="mt-1 text-[var(--color-text-secondary)]">No account manager is assigned.</p>
          )}
        </div>
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
          This changes the internal relationship owner only. It does not grant account access, change billing,
          move money, or reassign support cases. The reason and before/after owners are written to the audit log.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="ba-manager-id" className="text-xs text-[var(--color-text-secondary)]">
              Active account manager
            </label>
            <select
              id="ba-manager-id"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              aria-label="Active account manager"
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
              disabled={managersQuery.isLoading || managersQuery.isError}
            >
              <option value="">Select an active staff member</option>
              {(managersQuery.data ?? []).filter((staff) => (
                staff.is_active
                && staff.account_is_active !== false
                && (staff.account_role === undefined || staff.account_role === 'admin' || staff.account_role === 'super_admin')
              )).map((staff) => {
                const name = `${staff.user_first_name ?? ''} ${staff.user_last_name ?? ''}`.trim();
                const label = name || staff.user_email || 'Unnamed staff member';
                return (
                  <option key={staff.id} value={staff.user_id}>
                    {label}{staff.account_role ? ` · ${fmtLabel(staff.account_role)}` : ''}
                    {staff.role_name ? ` · ${fmtLabel(staff.role_name)} profile` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label htmlFor="ba-manager-reason" className="text-xs text-[var(--color-text-secondary)]">Assignment reason</label>
            <textarea
              id="ba-manager-reason"
              value={managerReason}
              onChange={(event) => setManagerReason(event.target.value)}
              placeholder="Why this staff account should own the relationship"
              className="mt-1 min-h-20 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={
              assignManager.isPending
              || managerId.trim().length === 0
              || managerId === account.accountManagerId
              || managerReason.trim().length < 10
            }
            onClick={() => assignManager.mutate({ accountManagerId: managerId.trim(), reason: managerReason.trim() })}
          >
            Assign
          </Button>
          {managerReason.trim().length > 0 && managerReason.trim().length < 10 && (
            <span className="text-xs text-amber-700">Reason must be at least 10 characters.</span>
          )}
          {managersQuery.isError && (
            <span role="alert" className="text-xs text-red-600">Could not load active staff members.</span>
          )}
          {assignManager.isError && (
            <span role="alert" className="text-xs text-red-600">{getErrorMessage(assignManager.error)}</span>
          )}
          {assignManager.isSuccess && (
            <span className="text-xs text-green-600">Account manager assigned.</span>
          )}
        </div>
      </div>

      <Dialog open={termsPreview !== null} onOpenChange={(open) => !open && !publishTerms.isPending && setTermsPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish new commercial terms</DialogTitle>
            <DialogDescription>
              This creates a new immutable version for future company bookings. It does not reprice existing work or statements.
            </DialogDescription>
          </DialogHeader>
          {termsPreview?.proposedTerms ? (
            <div className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 sm:grid-cols-3">
              <InfoRow label="Payment terms" value={fmtLabel(termsPreview.proposedTerms.paymentTerms)} />
              <InfoRow label="Discount" value={fmtPercent(termsPreview.proposedTerms.volumeDiscountRate)} />
              <InfoRow label="Approved billing credit" value={formatCurrency(termsPreview.proposedTerms.monthlyCreditLimit)} />
            </div>
          ) : null}
          {termsPreview ? <ImpactSummary impact={termsPreview.impact} /> : null}
          <div className="space-y-2">
            <Label htmlFor="business-terms-reason">Publication reason</Label>
            <textarea
              id="business-terms-reason"
              value={termsReason}
              onChange={(event) => setTermsReason(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="Explain why these prospective terms were approved"
            />
          </div>
          {publishTerms.isError ? <p role="alert" className="text-sm text-red-600">{getErrorMessage(publishTerms.error)}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermsPreview(null)} disabled={publishTerms.isPending}>Cancel</Button>
            <Button onClick={() => publishTerms.mutate()} disabled={publishTerms.isPending || termsReason.trim().length < 10}>
              {publishTerms.isPending ? 'Publishing…' : 'Publish terms version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── MembersTab ─────────────────────────────────────────────────────────────

function PermCheck({ on }: { on: boolean }): React.ReactElement {
  return on ? (
    <Check size={14} className="text-emerald-600" aria-label="yes" />
  ) : (
    <X size={14} className="text-[var(--color-text-secondary)]" aria-label="no" />
  );
}

export function MembersTab({ accountId }: { accountId: string }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-business-account-members', accountId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BusinessMember[] }>(
        `/api/v1/admin/business-accounts/${accountId}/members`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const members = q.data ?? [];

  const columns: Column<BusinessMember>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (m) => (
        <div>
          <Link to={`/customers/${m.userId}`} className="block font-medium text-sm text-[var(--color-secondary)] hover:underline">
            {memberName(m)}
          </Link>
          <span className="text-xs text-[var(--color-text-secondary)]">{m.email ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (m) => <Badge label={fmtLabel(m.role)} variant="info" />,
    },
    {
      key: 'canBook',
      header: 'Book',
      render: (m) => <PermCheck on={m.canBook} />,
    },
    {
      key: 'canApprove',
      header: 'Approve',
      render: (m) => <PermCheck on={m.canApprove} />,
    },
    {
      key: 'canViewInvoices',
      header: 'View invoices',
      render: (m) => <PermCheck on={m.canViewInvoices} />,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (m) => <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(m.createdAt)}</span>,
    },
  ];

  if (members.length === 0) {
    return <EmptyState title="No members on this account yet." />;
  }

  return (
    <DataTable
      columns={columns}
      data={members}
      keyExtractor={(m) => m.id}
      emptyMessage="No members on this account yet."
    />
  );
}

// ─── ContractsTab ────────────────────────────────────────────────────────────

export function ContractsTab({
  accountId,
  selectedContractId,
  onSelectedContractChange,
}: {
  accountId: string;
  selectedContractId?: string | null;
  onSelectedContractChange?: (contractId: string | null) => void;
}): React.ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{
    contract: BusinessContract;
    action: 'publish' | 'cancel';
    preview: BusinessControlPreview;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  const q = useQuery({
    queryKey: ['admin-business-account-contracts', accountId, page, selectedContractId],
    queryFn: async () => {
      const res = await api.get<PaginatedResult<BusinessContract>>(
        `/api/v1/admin/business-accounts/${accountId}/contracts`,
        { params: {
          page: selectedContractId ? 1 : page,
          pageSize,
          ...(selectedContractId ? { contractId: selectedContractId } : {}),
        } },
      );
      return res.data;
    },
  });

  const previewDecision = useMutation({
    mutationFn: async ({ contract, action }: { contract: BusinessContract; action: 'publish' | 'cancel' }) => {
      const response = await api.post<{ success: boolean; data: BusinessControlPreview }>(
        `/api/v1/admin/business-accounts/${accountId}/contracts/${contract.id}/${action}/preview`,
      );
      return { contract, action, preview: response.data.data };
    },
    onSuccess: (nextDecision) => {
      setDecision(nextDecision);
      setDecisionReason('');
    },
  });

  const applyDecision = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error('Run the contract impact preview first.');
      await api.post(
        `/api/v1/admin/business-accounts/${accountId}/contracts/${decision.contract.id}/${decision.action}`,
        { previewId: decision.preview.id, reason: decisionReason.trim() },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account-contracts', accountId] });
      setDecision(null);
      setDecisionReason('');
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const result = q.data!;
  const contracts = result.data ?? [];
  const pagination = result.pagination;

  const columns: Column<BusinessContract>[] = [
    {
      key: 'service',
      header: 'Service scope',
      render: (c) => (
        <div>
          <span className="block text-sm font-medium text-[var(--color-text)]">{c.subcategoryName ?? c.categoryName ?? 'Service unavailable'}</span>
          {c.subcategoryName && c.categoryName ? <span className="text-xs text-[var(--color-text-secondary)]">{c.categoryName}</span> : null}
        </div>
      ),
    },
    {
      key: 'contractType',
      header: 'Type',
      render: (c) => (
        <div>
          <span className="block text-sm text-[var(--color-text)]">{fmtLabel(c.contractType)}</span>
          {c.autoRenew && <span className="text-xs text-[var(--color-text-secondary)]">auto-renew</span>}
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (c) => c.providerId ? (
        <Link to={`/providers/${c.providerId}`} className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
          {c.providerName ?? 'Open provider'}
        </Link>
      ) : <span className="text-xs text-[var(--color-text-secondary)]">Open provider pool</span>,
    },
    {
      key: 'frequency',
      header: 'Frequency',
      render: (c) => (
        <span className="text-sm">
          {c.frequency ? fmtLabel(c.frequency) : c.contractType === 'on_demand' ? 'As needed' : 'Not set'}
        </span>
      ),
    },
    {
      key: 'agreedRate',
      header: 'Agreed rate',
      render: (c) => <span className="text-sm">{c.agreedRate != null ? formatCurrency(c.agreedRate) : '—'}</span>,
    },
    {
      key: 'discountPercentage',
      header: 'Contract discount',
      render: (c) => (
        <div>
          <span className="block text-sm">{fmtPercent(c.discountPercentage)}</span>
          {c.discountPercentage > 0 || c.providerId ? <span className="text-xs font-semibold text-amber-700">Publication held</span> : null}
        </div>
      ),
    },
    {
      key: 'estimatedMonthlyValue',
      header: 'Est. monthly',
      render: (c) => (
        <span className="text-sm">{c.estimatedMonthlyValue != null ? formatCurrency(c.estimatedMonthlyValue) : '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge label={fmtLabel(c.status)} variant={statusVariant(c.status)} />,
    },
    {
      key: 'dates',
      header: 'Start / End',
      render: (c) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (contract) => {
        if (!isSuperAdmin) return <span className="text-xs text-[var(--color-text-secondary)]">View only</span>;
        const action = contract.status === 'draft' && !contract.publishedAt
          ? 'publish'
          : contract.status === 'active' && contract.publishedAt
            ? 'cancel'
            : null;
        return action ? (
          <Button
            size="sm"
            variant={action === 'cancel' ? 'destructive' : 'outline'}
            onClick={() => previewDecision.mutate({ contract, action })}
            disabled={previewDecision.isPending || (action === 'publish' && (contract.discountPercentage > 0 || Boolean(contract.providerId)))}
          >
            Review {action}
          </Button>
        ) : <span className="text-xs text-[var(--color-text-secondary)]">No action</span>;
      },
    },
  ];

  if (contracts.length === 0) {
    return selectedContractId ? (
      <EmptyState
        title="Exact contract not found for this account."
        description="The contract may have been removed from this account or the handoff may be stale."
        action={<Button variant="outline" onClick={() => onSelectedContractChange?.(null)}>Show all account contracts</Button>}
      />
    ) : <EmptyState title="No contracts for this account." />;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Contract-level discounts and provider-specific drafts remain visible for review, but neither can be published yet. Discount authority is unresolved, and provider-specific assignment/funding remains held under E56. The billing engine never silently combines or infers those terms.
      </div>
      {selectedContractId ? (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing exact contract <span className="font-mono font-semibold">{selectedContractId.slice(0, 8).toUpperCase()}</span> from an operator handoff.
          </p>
          <Button variant="outline" size="sm" onClick={() => onSelectedContractChange?.(null)}>
            Show all contracts
          </Button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={contracts}
        keyExtractor={(c) => c.id}
        emptyMessage="No contracts for this account."
      />
      {!selectedContractId && pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
        />
      )}
      {previewDecision.isError ? <p role="alert" className="text-sm text-red-600">{getErrorMessage(previewDecision.error)}</p> : null}
      <Dialog open={decision !== null} onOpenChange={(open) => !open && !applyDecision.isPending && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.action === 'publish' ? 'Publish contract' : 'Cancel contract'}</DialogTitle>
            <DialogDescription>
              Contract lifecycle events are append-only. Existing booking price snapshots and statement lines do not change.
            </DialogDescription>
          </DialogHeader>
          {decision ? <ImpactSummary impact={decision.preview.impact} /> : null}
          <div className="space-y-2">
            <Label htmlFor="contract-decision-reason">Decision reason</Label>
            <textarea
              id="contract-decision-reason"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="Explain the reviewed commercial decision"
            />
          </div>
          {applyDecision.isError ? <p role="alert" className="text-sm text-red-600">{getErrorMessage(applyDecision.error)}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={applyDecision.isPending}>Cancel</Button>
            <Button
              variant={decision?.action === 'cancel' ? 'destructive' : 'default'}
              onClick={() => applyDecision.mutate()}
              disabled={applyDecision.isPending || decisionReason.trim().length < 10}
            >
              {applyDecision.isPending ? 'Applying…' : decision?.action === 'publish' ? 'Publish contract' : 'Cancel contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Bookings and support ────────────────────────────────────────────────────

export function BusinessBookingsTab({
  accountId,
  accountName,
  ownerUserId,
}: {
  accountId: string;
  accountName: string;
  ownerUserId: string | null;
}): React.ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const q = useQuery({
    queryKey: ['admin-business-account-bookings', accountId, page],
    queryFn: async () => {
      const res = await api.get<PaginatedResult<BusinessBooking>>('/api/v1/admin/bookings', {
        params: { businessAccountId: accountId, page, pageSize, sort: 'attention', view: 'all' },
      });
      return res.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState title="Failed to load business bookings" description={getErrorMessage(q.error)} />;

  const result = q.data!;
  const bookings = result.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Commercial work and case linkage</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Only bookings explicitly placed under this business account appear here. Payment and refund authority remains in Booking 360.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/support-tickets?businessAccountId=${encodeURIComponent(accountId)}&businessName=${encodeURIComponent(accountName)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-slate-50"
          >
            Open account support
          </Link>
          {ownerUserId && (
            <Link
              to={`/support-tickets?businessAccountId=${encodeURIComponent(accountId)}&businessName=${encodeURIComponent(accountName)}&userId=${encodeURIComponent(ownerUserId)}&userName=${encodeURIComponent(accountName)}&userRole=customer&new=1`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-slate-50"
            >
              Create account case
            </Link>
          )}
          <Link
            to={`/bookings?businessAccountId=${encodeURIComponent(accountId)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-slate-50"
          >
            Open full booking queue
          </Link>
        </div>
      </div>

      {bookings.length === 0 ? <EmptyState title="No bookings are linked to this business account." /> : (
        <section aria-label="Business account bookings" className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          {bookings.map((booking) => (
            <article key={booking.id} className="grid gap-4 border-b border-[var(--color-border)] p-4 last:border-b-0 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Work order</p>
                <Link to={`/bookings/${booking.id}`} className="font-mono text-xs font-semibold text-[var(--color-primary)] hover:underline">{booking.id.slice(0, 8)}</Link>
                <p className="mt-1 font-medium text-[var(--color-text)]">{booking.categoryName}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{fmtDateTime(booking.scheduledAt, booking.createdAt)} PHT</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Customer and provider</p>
                <Link to={`/customers/${booking.customerId}`} className="block truncate font-medium text-[var(--color-secondary)] hover:underline">{booking.customerName || 'Unnamed customer'}</Link>
                {booking.providerId ? (
                  <Link to={`/providers/${booking.providerId}`} className="mt-1 block truncate text-sm font-medium text-[var(--color-secondary)] hover:underline">{booking.providerName || 'Unnamed provider'}</Link>
                ) : <p className="mt-1 text-xs font-medium text-amber-700">Provider not assigned</p>}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Work and support state</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge label={fmtLabel(booking.status)} variant={statusVariant(booking.status)} />
                  <Badge label={`Escrow: ${fmtLabel(booking.escrowStatus)}`} variant="info" />
                </div>
                <Link to={`/support-tickets?bookingId=${encodeURIComponent(booking.id)}`} className="mt-2 block text-xs font-semibold text-[var(--color-secondary)] hover:underline">{booking.openSupportTickets} open support case{booking.openSupportTickets === 1 ? '' : 's'}</Link>
                <p className={`text-xs ${booking.openDisputes > 0 ? 'font-semibold text-red-700' : 'text-[var(--color-text-secondary)]'}`}>{booking.openDisputes} open dispute{booking.openDisputes === 1 ? '' : 's'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Contract and billing</p>
                <p className="font-semibold text-[var(--color-text)]">{formatCurrency(booking.totalAmount)}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{booking.contractId ? `${fmtLabel(booking.contractType ?? 'contract')} contract` : 'No contract linked'}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{booking.invoiceNumber ? `${booking.invoiceNumber} · ${fmtLabel(booking.invoiceStatus ?? 'unknown')}` : 'Not yet invoiced'}</p>
              </div>
            </article>
          ))}
        </section>
      )}
      {result.pagination && result.pagination.totalPages > 1 ? (
        <Pagination
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          total={result.pagination.total}
          pageSize={result.pagination.pageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}

// ─── InvoicesTab ─────────────────────────────────────────────────────────────

export function InvoicesTab({
  accountId,
  selectedInvoiceId,
  onSelectedInvoiceChange,
}: {
  accountId: string;
  selectedInvoiceId?: string | null;
  onSelectedInvoiceChange?: (invoiceId: string | null) => void;
}): React.ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const [actionError, setActionError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview | null>(null);
  const [preparationReason, setPreparationReason] = useState('');
  const [localExpandedInvoiceId, setLocalExpandedInvoiceId] = useState<string | null>(null);
  const expandedInvoiceId = selectedInvoiceId === undefined
    ? localExpandedInvoiceId
    : selectedInvoiceId;

  function setExpandedInvoiceId(invoiceId: string | null | ((current: string | null) => string | null)): void {
    const nextInvoiceId = typeof invoiceId === 'function'
      ? invoiceId(expandedInvoiceId)
      : invoiceId;
    if (selectedInvoiceId === undefined) setLocalExpandedInvoiceId(nextInvoiceId);
    onSelectedInvoiceChange?.(nextInvoiceId);
  }

  const q = useQuery({
    queryKey: ['admin-business-account-invoices', accountId, page],
    queryFn: async () => {
      const res = await api.get<PaginatedResult<BusinessInvoice>>(
        `/api/v1/admin/business-accounts/${accountId}/invoices`,
        { params: { page, pageSize } },
      );
      return res.data;
    },
  });

  const previewStatements = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean; data: InvoicePreview }>(
        `/api/v1/admin/business-accounts/${accountId}/invoices/preview`,
        {},
      );
      return response.data.data;
    },
    onSuccess: (nextPreview) => {
      setInvoicePreview(nextPreview);
      setPreparationReason('');
      setActionError('');
      setActionInfo('Candidate work was previewed. Review every exception and statement group before preparing drafts.');
    },
    onError: (e) => { setActionInfo(''); setActionError(getErrorMessage(e)); },
  });

  const prepareDrafts = useMutation({
    mutationFn: async () => {
      if (!invoicePreview) throw new Error('Run the statement preview first.');
      const response = await api.post<{ success: boolean; data: BusinessInvoice[] }>(
        `/api/v1/admin/business-accounts/${accountId}/invoices/prepare`,
        { previewId: invoicePreview.id, reason: preparationReason.trim() },
      );
      return response.data.data;
    },
    onSuccess: (drafts) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account-invoices', accountId] });
      setInvoicePreview(null);
      setPreparationReason('');
      setActionError('');
      setActionInfo(`${drafts.length} controlled draft statement${drafts.length === 1 ? '' : 's'} prepared. A super admin must finalize each draft separately.`);
    },
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const result = q.data!;
  const invoices = result.data ?? [];
  const pagination = result.pagination;

  const columns: Column<BusinessInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => (
        <button
          type="button"
          aria-expanded={expandedInvoiceId === inv.id}
          onClick={() => setExpandedInvoiceId((current) => current === inv.id ? null : inv.id)}
          className="min-h-11 font-mono text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          {inv.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (inv) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {fmtDate(inv.billingPeriodStart)} – {fmtDate(inv.billingPeriodEnd)}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (inv) => <span className="text-sm font-medium">{formatCurrency(inv.totalAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status / settlement',
      render: (inv) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge label={fmtLabel(inv.status)} variant={INVOICE_STATUS_VARIANT[inv.status] ?? 'info'} />
          {inv.controlState === 'controlled' && inv.settlementState
            ? <Badge label={fmtLabel(inv.settlementState)} variant={INVOICE_STATUS_VARIANT[inv.settlementState] ?? 'info'} />
            : null}
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (inv) => <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(inv.dueDate)}</span>,
    },
    {
      key: 'paidAt',
      header: 'Paid',
      render: (inv) => <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(inv.paidAt)}</span>,
    },
    {
      key: 'paymentReference',
      header: 'Payment reference',
      render: (inv) => <span className="text-xs text-[var(--color-text-secondary)]">{inv.paymentReference ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (invoice) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExpandedInvoiceId(invoice.id)}
        >
          {invoice.status === 'draft' && isSuperAdmin ? 'Review draft' : 'Open evidence'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Controlled commercial statements</h3>
          <p className="mt-1 max-w-3xl text-xs text-[var(--color-text-secondary)]">
            Preview exact-account booking candidates first. Preparation creates internal drafts grouped by the terms version captured on each booking. Finalization is a separate super-admin decision.
          </p>
        </div>
        <button
          type="button"
          onClick={() => previewStatements.mutate()}
          disabled={previewStatements.isPending}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
        >
          {previewStatements.isPending ? 'Previewing…' : 'Preview previous month'}
        </button>
      </div>
      {invoicePreview ? (
        <Card className="space-y-4 border-l-4 border-l-[var(--color-primary)] p-4">
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text)]">
              Preview {fmtDate(invoicePreview.billingPeriodStart)} to {fmtDate(invoicePreview.billingPeriodEnd)}
            </h4>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {invoicePreview.groups.length} statement group{invoicePreview.groups.length === 1 ? '' : 's'} and {invoicePreview.exceptions.length} blocking exception{invoicePreview.exceptions.length === 1 ? '' : 's'}.
            </p>
          </div>
          {invoicePreview.exceptions.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800">Resolve before preparation</p>
              {invoicePreview.exceptions.map((exception) => (
                <div key={`${exception.bookingId}-${exception.code}`} className="text-sm text-red-800">
                  <Link to={`/bookings/${exception.bookingId}`} className="font-mono text-xs font-semibold underline">{exception.bookingId.slice(0, 8)}</Link>
                  <span className="ml-2 font-semibold">{fmtLabel(exception.code)}:</span> {exception.message}
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {invoicePreview.groups.map((group) => (
              <div key={group.accountTermsVersionId} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{fmtLabel(group.paymentTerms)} · {group.items.length} work order{group.items.length === 1 ? '' : 's'}</p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)]">Terms {group.accountTermsVersionId.slice(0, 8)}</p>
                  </div>
                  <p className="font-semibold text-[var(--color-text)]">{formatCurrency(group.totalAmount)}</p>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <InfoRow label="Subtotal" value={formatCurrency(group.subtotal)} />
                  <InfoRow label="Discount" value={formatCurrency(group.discountAmount)} />
                  <InfoRow label="Tax" value={formatCurrency(group.taxAmount)} />
                </dl>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-preparation-reason">Preparation reason</Label>
            <textarea
              id="statement-preparation-reason"
              value={preparationReason}
              onChange={(event) => setPreparationReason(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="Explain why this candidate set is ready for draft preparation"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setInvoicePreview(null)} disabled={prepareDrafts.isPending}>Discard preview</Button>
            <Button
              onClick={() => prepareDrafts.mutate()}
              disabled={
                prepareDrafts.isPending
                || invoicePreview.exceptions.length > 0
                || invoicePreview.groups.length === 0
                || preparationReason.trim().length < 10
              }
            >
              {prepareDrafts.isPending ? 'Preparing…' : 'Prepare controlled drafts'}
            </Button>
          </div>
        </Card>
      ) : null}
      {actionInfo && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{actionInfo}</p>}
      {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
      {invoices.length === 0 ? (
        <EmptyState title="No invoices for this account." />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          keyExtractor={(inv) => inv.id}
          emptyMessage="No invoices for this account."
        />
      )}
      {expandedInvoiceId ? <InvoiceDetailPanel invoiceId={expandedInvoiceId} onClose={() => setExpandedInvoiceId(null)} /> : null}
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function InvoiceDetailPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }): React.ReactElement {
  const q = useQuery({
    queryKey: ['admin-business-invoice-detail', invoiceId],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: {
          invoice: BusinessInvoice;
          items: BusinessInvoiceItem[];
          balance: InvoiceBalance;
          ledger: { adjustments: InvoiceAdjustmentEvidence[]; payments: InvoicePaymentEvidence[] };
        };
      }>(`/api/v1/admin/invoices/${invoiceId}`);
      return res.data.data;
    },
  });

  return (
    <Card className="p-4" aria-label="Invoice booking detail">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Statement evidence and linked work orders</h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">This is a commercial statement, not a claim of BIR principal-invoice authority. Booking 360 remains the source for work, proof, dispute, and provider context.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
      {q.isLoading ? <div className="mt-4"><LoadingState /></div> : null}
      {q.isError ? <div className="mt-4"><ErrorState title="Failed to load invoice line items" description={getErrorMessage(q.error)} /></div> : null}
      {q.data ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-slate-50/70 p-3 sm:grid-cols-4">
            <InfoRow label="Invoice" value={q.data.invoice.invoiceNumber} mono />
            <InfoRow label="Status" value={fmtLabel(q.data.invoice.status)} />
            <InfoRow label="Control state" value={fmtLabel(q.data.invoice.controlState)} />
            <InfoRow label="Settlement state" value={fmtLabel(q.data.invoice.settlementState ?? 'legacy_unreviewed')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiCard title="Original total" value={formatCurrency(q.data.invoice.totalAmount)} icon={null} />
            <KpiCard title="Adjustments" value={formatCurrency(q.data.balance.adjustmentTotal)} icon={null} />
            <KpiCard title="Payment evidence" value={formatCurrency(q.data.balance.paymentTotal)} icon={null} />
            <KpiCard title={q.data.balance.balanceDue < 0 ? 'Credit due' : 'Balance due'} value={formatCurrency(Math.abs(q.data.balance.balanceDue))} icon={null} />
          </div>
          <InvoiceOperatorActions
            invoice={q.data.invoice}
            balance={q.data.balance}
            adjustments={q.data.ledger.adjustments}
            payments={q.data.ledger.payments}
          />
          {q.data.items.length === 0 ? <EmptyState title="This invoice has no line items." /> : (
            <section aria-label="Invoice line items" className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              {q.data.items.map((item) => (
                <article key={item.id} className="grid gap-3 border-b border-[var(--color-border)] bg-white p-3 last:border-b-0 md:grid-cols-[1.3fr_1fr_0.8fr]">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-text)]">{item.serviceName ?? item.description}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">Service date: {fmtDate(item.serviceDate)}</p>
                    {item.bookingId ? <Link to={`/bookings/${item.bookingId}`} className="mt-1 inline-block font-mono text-xs font-semibold text-[var(--color-primary)] hover:underline">Open booking {item.bookingId.slice(0, 8)}</Link> : <p className="mt-1 text-xs text-amber-700">No booking is linked to this line item.</p>}
                  </div>
                  <div className="min-w-0 text-sm">
                    {item.customerId ? <Link to={`/customers/${item.customerId}`} className="block truncate font-medium text-[var(--color-secondary)] hover:underline">{item.customerName ?? 'Open customer'}</Link> : null}
                    {item.providerId ? <Link to={`/providers/${item.providerId}`} className="mt-1 block truncate text-[var(--color-secondary)] hover:underline">{item.providerName ?? 'Open provider'}</Link> : <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Provider not linked</p>}
                    {item.bookingStatus ? <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Booking: {fmtLabel(item.bookingStatus)}</p> : null}
                  </div>
                  <div className="text-sm md:text-right">
                    <p className="font-semibold text-[var(--color-text)]">{formatCurrency(item.amount)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                    {item.discountAmount > 0 ? <p className="text-xs text-emerald-700">Discount {formatCurrency(item.discountAmount)}</p> : null}
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      ) : null}
    </Card>
  );
}

type InvoiceOperatorAction =
  | { kind: 'finalize' }
  | { kind: 'void' }
  | { kind: 'payment'; maxAmount: number }
  | { kind: 'adjustment' }
  | { kind: 'reversal'; paymentId: string; maxAmount: number };

export function manilaDateTimeInputNow(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => (
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  );
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function manilaDateTimeInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Enter a valid Philippine date and time.');
  }
  const parsed = new Date(`${value}:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid Philippine date and time.');
  return parsed.toISOString();
}

function InvoiceOperatorActions({
  invoice,
  balance,
  adjustments,
  payments,
}: {
  invoice: BusinessInvoice;
  balance: InvoiceBalance;
  adjustments: InvoiceAdjustmentEvidence[];
  payments: InvoicePaymentEvidence[];
}): React.ReactElement {
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === 'super_admin';
  const queryClient = useQueryClient();
  const [action, setAction] = useState<InvoiceOperatorAction | null>(null);
  const [reason, setReason] = useState('');
  const [amountPesos, setAmountPesos] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [externalReference, setExternalReference] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(manilaDateTimeInputNow());
  const [adjustmentType, setAdjustmentType] = useState('credit');

  function resetAction(): void {
    setAction(null);
    setReason('');
    setAmountPesos('');
    setMethod('bank_transfer');
    setExternalReference('');
    setEvidenceReference('');
    setEffectiveAt(manilaDateTimeInputNow());
    setAdjustmentType('credit');
  }

  function openAction(nextAction: InvoiceOperatorAction): void {
    resetAction();
    setAction(nextAction);
    if ('maxAmount' in nextAction) setAmountPesos(String(nextAction.maxAmount / 100));
  }

  const parsedAmount = Number(amountPesos);
  const amountCentavos = Math.round(parsedAmount * 100);
  const amountValid = Number.isFinite(parsedAmount)
    && parsedAmount > 0
    && Number.isSafeInteger(amountCentavos)
    && (!action || !('maxAmount' in action) || amountCentavos <= action.maxAmount)
    && (action?.kind !== 'adjustment'
      || adjustmentType === 'debit'
      || (adjustmentType === 'write_off'
        ? amountCentavos <= Math.max(balance.balanceDue, 0)
        : amountCentavos <= balance.adjustedTotal));
  const needsAmount = action?.kind === 'payment' || action?.kind === 'adjustment' || action?.kind === 'reversal';
  const needsExternalEvidence = action?.kind === 'payment' || action?.kind === 'reversal';
  const formValid = reason.trim().length >= 10
    && (!needsAmount || amountValid)
    && (!needsExternalEvidence || (
      externalReference.trim().length >= 3
      && evidenceReference.trim().length >= 3
      && effectiveAt.length > 0
    ))
    && (action?.kind !== 'adjustment' || evidenceReference.trim().length >= 3);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error('Choose a statement action.');
      if (action.kind === 'finalize' || action.kind === 'void') {
        await api.post(`/api/v1/admin/invoices/${invoice.id}/${action.kind}`, {
          expectedVersion: invoice.recordVersion,
          reason: reason.trim(),
        });
        return;
      }
      if (action.kind === 'adjustment') {
        await api.post(`/api/v1/admin/invoices/${invoice.id}/adjustments`, {
          expectedVersion: invoice.recordVersion,
          adjustmentType,
          amount: amountCentavos,
          currency: 'PHP',
          evidenceReference: evidenceReference.trim(),
          reason: reason.trim(),
        });
        return;
      }
      const externalPayload = {
        expectedVersion: invoice.recordVersion,
        amount: amountCentavos,
        currency: 'PHP',
        effectiveAt: manilaDateTimeInputToIso(effectiveAt),
        externalReference: externalReference.trim(),
        evidenceReference: evidenceReference.trim(),
        reason: reason.trim(),
      };
      if (action.kind === 'payment') {
        await api.post(`/api/v1/admin/invoices/${invoice.id}/payments`, {
          ...externalPayload,
          method,
        });
      } else {
        await api.post(`/api/v1/admin/invoices/${invoice.id}/payments/${action.paymentId}/reverse`, externalPayload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-business-invoice-detail', invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-business-account-invoices'] });
      resetAction();
    },
  });

  const reversalByPayment = new Map<string, number>();
  for (const entry of payments) {
    if (entry.entryType === 'reversal' && entry.reversesPaymentId) {
      reversalByPayment.set(
        entry.reversesPaymentId,
        (reversalByPayment.get(entry.reversesPaymentId) ?? 0) + entry.amount,
      );
    }
  }

  const actionTitle = action?.kind === 'finalize' ? 'Finalize controlled statement'
    : action?.kind === 'void' ? 'Void statement'
      : action?.kind === 'payment' ? 'Record external payment evidence'
        : action?.kind === 'adjustment' ? 'Record statement adjustment'
          : 'Record payment reversal or refund evidence';

  return (
    <div className="space-y-4">
      {invoice.controlState !== 'controlled' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This is a legacy unreviewed record. It remains readable, but controlled payment, adjustment, finalization, and void actions are disabled until production history is reconciled.
        </div>
      ) : null}

      {invoice.controlState === 'controlled' ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-border)] p-3">
          {invoice.status === 'draft' && isSuperAdmin ? <Button size="sm" onClick={() => openAction({ kind: 'finalize' })}>Finalize draft</Button> : null}
          {['sent', 'overdue'].includes(invoice.status) && balance.balanceDue > 0 && isSuperAdmin ? (
            <Button size="sm" onClick={() => openAction({ kind: 'payment', maxAmount: balance.balanceDue })}>Record payment evidence</Button>
          ) : null}
          {['sent', 'overdue', 'paid'].includes(invoice.status) && isSuperAdmin ? (
            <Button size="sm" variant="outline" onClick={() => openAction({ kind: 'adjustment' })}>Add credit, debit, or write-off</Button>
          ) : null}
          {['draft', 'sent', 'overdue'].includes(invoice.status)
            && adjustments.length === 0
            && payments.length === 0
            && isSuperAdmin ? (
              <Button size="sm" variant="destructive" onClick={() => openAction({ kind: 'void' })}>Review void</Button>
            ) : null}
          {!isSuperAdmin ? <Badge label="Financial actions require super admin" variant="warning" /> : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-3">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">Adjustments</h4>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Credits reduce the statement, debits increase it, and write-offs settle an approved amount without claiming cash moved.</p>
          {adjustments.length === 0 ? <p className="mt-3 text-sm text-[var(--color-text-secondary)]">No adjustments recorded.</p> : (
            <div className="mt-3 space-y-2">
              {adjustments.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                  <div className="flex justify-between gap-3"><Badge label={fmtLabel(entry.adjustmentType)} variant="info" /><strong>{formatCurrency(entry.amount)}</strong></div>
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{entry.evidenceReference}</p>
                  <p className="mt-1 text-xs text-[var(--color-text)]">{entry.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-3">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">External payment evidence</h4>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Operator-recorded evidence is not PayMongo or bank verification. Each reversal links to the original payment instead of deleting it.</p>
          {payments.length === 0 ? <p className="mt-3 text-sm text-[var(--color-text-secondary)]">No payment evidence recorded.</p> : (
            <div className="mt-3 space-y-2">
              {payments.map((entry) => {
                const available = entry.entryType === 'payment'
                  ? entry.amount - (reversalByPayment.get(entry.id) ?? 0)
                  : 0;
                return (
                  <div key={entry.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><Badge label={fmtLabel(entry.entryType)} variant={entry.entryType === 'payment' ? 'success' : 'warning'} /><p className="mt-1 font-mono text-xs">{entry.externalReference}</p></div>
                      <strong>{entry.entryType === 'reversal' ? '+' : '−'}{formatCurrency(entry.amount)}</strong>
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{fmtLabel(entry.method)} · effective {fmtDateTime(entry.effectiveAt, entry.createdAt)} PHT</p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Evidence: {entry.evidenceReference}</p>
                    {isSuperAdmin && entry.entryType === 'payment' && available > 0 ? (
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => openAction({ kind: 'reversal', paymentId: entry.id, maxAmount: available })}>
                        Record reversal/refund evidence
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && !mutation.isPending && resetAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              This appends controlled evidence and uses record version {invoice.recordVersion}. It never rewrites existing booking prices, line items, payments, or adjustments.
            </DialogDescription>
          </DialogHeader>
          {needsAmount ? (
            <div className="space-y-2">
              <Label htmlFor="invoice-action-amount">Amount (PHP)</Label>
              <Input id="invoice-action-amount" type="number" min="0.01" step="0.01" value={amountPesos} onChange={(event) => setAmountPesos(event.target.value)} />
              {!amountValid && amountPesos ? <p className="text-xs text-amber-700">Enter a positive amount within the available statement total, balance, or unreversed payment amount for this action.</p> : null}
            </div>
          ) : null}
          {action?.kind === 'adjustment' ? (
            <div className="space-y-2">
              <Label htmlFor="invoice-adjustment-type">Adjustment type</Label>
              <select id="invoice-adjustment-type" value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value)} className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                <option value="credit">Credit or rate reduction</option>
                <option value="debit">Debit or approved additional charge</option>
                <option value="write_off">Write-off</option>
              </select>
            </div>
          ) : null}
          {action?.kind === 'payment' ? (
            <div className="space-y-2">
              <Label htmlFor="invoice-payment-method">External method</Label>
              <select id="invoice-payment-method" value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash_deposit">Cash deposit</option>
                <option value="check">Check</option>
                <option value="other_external">Other external</option>
              </select>
            </div>
          ) : null}
          {needsExternalEvidence ? (
            <>
              <div className="space-y-2"><Label htmlFor="invoice-effective-at">Effective date and time (Philippine time, UTC+8)</Label><Input id="invoice-effective-at" type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="invoice-external-reference">Unique external reference</Label><Input id="invoice-external-reference" value={externalReference} onChange={(event) => setExternalReference(event.target.value)} autoComplete="off" /></div>
            </>
          ) : null}
          {(needsExternalEvidence || action?.kind === 'adjustment') ? (
            <div className="space-y-2"><Label htmlFor="invoice-evidence-reference">Evidence reference</Label><Input id="invoice-evidence-reference" value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Private receipt, bank line, support case, or approval record" autoComplete="off" /></div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="invoice-action-reason">Operator reason</Label>
            <textarea id="invoice-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Explain why this action is correct (minimum 10 characters)" />
          </div>
          {mutation.isError ? <p role="alert" className="text-sm text-red-600">{getErrorMessage(mutation.error)}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={resetAction} disabled={mutation.isPending}>Cancel</Button>
            <Button variant={action?.kind === 'void' ? 'destructive' : 'default'} onClick={() => mutation.mutate()} disabled={mutation.isPending || !formValid}>
              {mutation.isPending ? 'Recording…' : 'Confirm and append evidence'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
