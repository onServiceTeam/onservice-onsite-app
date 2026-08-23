/**
 * Business Account 360 admin detail page.
 *
 * 4 tabs: Overview, Members, Contracts, Invoices.
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
 *   POST /api/v1/admin/business-accounts/:id/set-discount
 *   POST /api/v1/admin/business-accounts/:id/assign-manager
 *   POST /api/v1/admin/invoices/:id/mark-paid
 */

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  ownerUserId: string | null;
  status: string;
  paymentTerms: string;
  volumeDiscountRate: number; // percent number
  monthlyCreditLimit: number | null; // centavos
  notes: string | null;
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
  contractType: string;
  frequency: string;
  agreedRate: number | null; // centavos
  discountPercentage: number; // percent
  estimatedMonthlyValue: number | null; // centavos
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: string;
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
  createdAt: string;
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
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
  role_name?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

type TabId = 'overview' | 'members' | 'contracts' | 'invoices';

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
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPercent(pct: number): string {
  return `${pct}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function memberName(m: BusinessMember): string {
  const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
  return name.length > 0 ? name : '—';
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function BusinessAccountDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const accountId = id ?? '';
  const [tab, setTab] = useState<TabId>('overview');

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab account={account} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab accountId={accountId} />
        </TabsContent>
        <TabsContent value="contracts">
          <ContractsTab accountId={accountId} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab accountId={accountId} />
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

// ─── OverviewTab ──────────────────────────────────────────────────────────

function OverviewTab({ account }: { account: BusinessAccount }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <KpiCard
        title="Volume discount"
        value={account.volumeDiscountRate > 0 ? fmtPercent(account.volumeDiscountRate) : '—'}
        icon={<Coins size={16} />}
      />
      <KpiCard
        title="Monthly credit limit"
        value={account.monthlyCreditLimit && account.monthlyCreditLimit > 0 ? formatCurrency(account.monthlyCreditLimit) : '—'}
        icon={<CreditCard size={16} />}
      />

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Account information</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow label="Business type" value={fmtLabel(account.businessType)} />
          <InfoRow label="Payment terms" value={fmtLabel(account.paymentTerms)} />
          <InfoRow label="Registration #" value={account.registrationNumber ?? '—'} />
          <InfoRow label="Tax ID" value={account.taxId ?? '—'} />
          <InfoRow label="Owner user ID" value={account.ownerUserId ?? '—'} mono />
          <InfoRow label="Account manager ID" value={account.accountManagerId ?? '—'} mono />
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

  // volumeDiscountRate is a percent (0..50). monthlyCreditLimit is entered
  // by the user in PESOS and converted to centavos before POST.
  const [discountPct, setDiscountPct] = useState(String(account.volumeDiscountRate ?? ''));
  const [creditLimitPesos, setCreditLimitPesos] = useState(
    account.monthlyCreditLimit != null ? String(account.monthlyCreditLimit / 100) : '',
  );
  const [managerId, setManagerId] = useState(account.accountManagerId ?? '');

  const managersQuery = useQuery({
    queryKey: ['adminStaff', 'active-manager-options'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff?page=1&limit=100&isActive=true');
      return (res.data.data ?? []) as AdminStaffOption[];
    },
    enabled: isSuperAdmin,
  });

  const setDiscount = useMutation({
    mutationFn: async (input: { volumeDiscountRate?: number; monthlyCreditLimit?: number }) => {
      const res = await api.post<{ success: boolean; data: BusinessAccount }>(
        `/api/v1/admin/business-accounts/${account.id}/set-discount`,
        input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-business-account', account.id] });
    },
  });

  const assignManager = useMutation({
    mutationFn: async (input: { accountManagerId: string }) => {
      const res = await api.post<{ success: boolean; data: BusinessAccount }>(
        `/api/v1/admin/business-accounts/${account.id}/assign-manager`,
        input,
      );
      return res.data.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-business-account', account.id] });
      setManagerId(updated.accountManagerId ?? '');
    },
  });

  const parsedPct = Number(discountPct);
  const pctValid =
    discountPct.trim() !== '' && Number.isFinite(parsedPct) && parsedPct >= 0 && parsedPct <= 50;

  const parsedPesos = Number(creditLimitPesos);
  const creditValid =
    creditLimitPesos.trim() === '' ||
    (Number.isFinite(parsedPesos) && parsedPesos >= 0);

  function submitBilling(): void {
    const input: { volumeDiscountRate?: number; monthlyCreditLimit?: number } = {};
    if (pctValid) input.volumeDiscountRate = parsedPct;
    if (creditLimitPesos.trim() !== '' && Number.isFinite(parsedPesos) && parsedPesos >= 0) {
      input.monthlyCreditLimit = Math.round(parsedPesos * 100);
    }
    if (input.volumeDiscountRate === undefined && input.monthlyCreditLimit === undefined) return;
    setDiscount.mutate(input);
  }

  if (!isSuperAdmin) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">Billing settings</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Volume discount and account manager changes require a super admin.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Billing settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ba-discount-pct" className="text-xs text-[var(--color-text-secondary)]">
              Volume discount (%) — 0 to 50
            </label>
            <input
              id="ba-discount-pct"
              type="number"
              step="1"
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
              Monthly credit limit (PHP)
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
            disabled={setDiscount.isPending || (!pctValid && creditLimitPesos.trim() === '') || !creditValid}
            onClick={submitBilling}
          >
            Save billing settings
          </Button>
          {!pctValid && discountPct.trim() !== '' && (
            <span className="text-xs text-amber-600">Discount must be 0–50%.</span>
          )}
          {!creditValid && (
            <span className="text-xs text-amber-600">Credit limit must be a non-negative amount.</span>
          )}
          {setDiscount.isError && (
            <span role="alert" className="text-xs text-red-600">{getErrorMessage(setDiscount.error)}</span>
          )}
          {setDiscount.isSuccess && (
            <span className="text-xs text-green-600">Billing settings updated.</span>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <UserCheck size={14} /> Assign account manager
        </h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[260px]">
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
              {(managersQuery.data ?? []).filter((staff) => staff.is_active).map((staff) => {
                const name = `${staff.user_first_name ?? ''} ${staff.user_last_name ?? ''}`.trim();
                const label = name || staff.user_email || 'Unnamed staff member';
                return (
                  <option key={staff.id} value={staff.user_id}>
                    {label}{staff.role_name ? ` · ${fmtLabel(staff.role_name)}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <Button
            size="sm"
            disabled={assignManager.isPending || managerId.trim().length === 0}
            onClick={() => assignManager.mutate({ accountManagerId: managerId.trim() })}
          >
            Assign
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
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

function MembersTab({ accountId }: { accountId: string }): React.ReactElement {
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
          <span className="block font-medium text-sm text-[var(--color-text)]">{memberName(m)}</span>
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

function ContractsTab({ accountId }: { accountId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const q = useQuery({
    queryKey: ['admin-business-account-contracts', accountId, page],
    queryFn: async () => {
      const res = await api.get<PaginatedResult<BusinessContract>>(
        `/api/v1/admin/business-accounts/${accountId}/contracts`,
        { params: { page, pageSize } },
      );
      return res.data;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const result = q.data!;
  const contracts = result.data ?? [];
  const pagination = result.pagination;

  const columns: Column<BusinessContract>[] = [
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
      key: 'frequency',
      header: 'Frequency',
      render: (c) => <span className="text-sm">{fmtLabel(c.frequency)}</span>,
    },
    {
      key: 'agreedRate',
      header: 'Agreed rate',
      render: (c) => <span className="text-sm">{c.agreedRate != null ? formatCurrency(c.agreedRate) : '—'}</span>,
    },
    {
      key: 'discountPercentage',
      header: 'Discount',
      render: (c) => <span className="text-sm">{fmtPercent(c.discountPercentage)}</span>,
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
  ];

  if (contracts.length === 0) {
    return <EmptyState title="No contracts for this account." />;
  }

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={contracts}
        keyExtractor={(c) => c.id}
        emptyMessage="No contracts for this account."
      />
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

// ─── InvoicesTab ─────────────────────────────────────────────────────────────

export function InvoicesTab({ accountId }: { accountId: string }): React.ReactElement {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [markPaidTarget, setMarkPaidTarget] = useState<BusinessInvoice | null>(null);
  const [paymentReference, setPaymentReference] = useState('');

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

  const markPaid = useMutation({
    mutationFn: async ({ invoiceId, paymentReference }: { invoiceId: string; paymentReference: string }) => {
      await api.post(`/api/v1/admin/invoices/${invoiceId}/mark-paid`, { paymentReference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-business-account-invoices', accountId] });
      setActionError('');
      setActionInfo('Invoice marked paid with the recorded payment reference.');
      setMarkPaidTarget(null);
      setPaymentReference('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  // Phase 200 — generate last month's invoice for this account on demand.
  const generate = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; data: { generated: number; message: string } }>(
        `/api/v1/admin/business-accounts/${accountId}/generate-invoice`,
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-business-account-invoices', accountId] });
      setActionError('');
      setActionInfo(data.message);
    },
    onError: (e) => { setActionInfo(''); setActionError(getErrorMessage(e)); },
  });

  function handleMarkPaid(invoice: BusinessInvoice): void {
    setActionError('');
    setActionInfo('');
    setPaymentReference('');
    setMarkPaidTarget(invoice);
  }

  function submitMarkPaid(): void {
    if (!markPaidTarget) return;
    const trimmed = paymentReference.trim();
    if (trimmed.length === 0) {
      setActionError('Payment reference is required.');
      return;
    }
    markPaid.mutate({ invoiceId: markPaidTarget.id, paymentReference: trimmed });
  }

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState description={getErrorMessage(q.error)} />;
  const result = q.data!;
  const invoices = result.data ?? [];
  const pagination = result.pagination;

  const columns: Column<BusinessInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => <span className="font-mono text-xs text-[var(--color-text)]">{inv.invoiceNumber}</span>,
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
      header: 'Status',
      render: (inv) => <Badge label={fmtLabel(inv.status)} variant={INVOICE_STATUS_VARIANT[inv.status] ?? 'info'} />,
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
      key: 'actions',
      header: '',
      render: (inv) =>
        inv.status !== 'paid' && inv.paidAt === null ? (
          <button
            type="button"
            aria-label={`Mark invoice ${inv.invoiceNumber} paid`}
            onClick={() => handleMarkPaid(inv)}
            disabled={markPaid.isPending}
            className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
          >
            Mark paid
          </button>
        ) : (
          <span className="text-xs text-[var(--color-text-secondary)]">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Invoices bill the just-ended month. Pressing Generate is safe to repeat — it won&apos;t duplicate an existing one.
        </p>
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
        >
          {generate.isPending ? 'Generating...' : 'Generate invoice (last month)'}
        </button>
      </div>
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
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
        />
      )}
      <Dialog
        open={markPaidTarget !== null}
        onOpenChange={(open) => {
          if (!open && !markPaid.isPending) {
            setMarkPaidTarget(null);
            setPaymentReference('');
            setActionError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark invoice paid</DialogTitle>
            <DialogDescription>
              Record the external payment reference for invoice{' '}
              {markPaidTarget?.invoiceNumber ?? ''}. This becomes part of the account&apos;s audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invoice-payment-reference">Payment reference</Label>
            <Input
              id="invoice-payment-reference"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="Bank transfer, deposit, or official receipt number"
              autoComplete="off"
            />
            {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMarkPaidTarget(null)}
              disabled={markPaid.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitMarkPaid}
              disabled={markPaid.isPending || paymentReference.trim().length === 0}
            >
              {markPaid.isPending ? 'Saving…' : 'Confirm paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
