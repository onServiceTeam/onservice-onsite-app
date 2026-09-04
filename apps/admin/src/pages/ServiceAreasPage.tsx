import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import {
  DataTable,
  Badge,
  Pagination,
  useReasonDialog,
  type Column,
} from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';

interface ServiceArea {
  id: string;
  name: string;
  slug: string;
  city: string;
  province: string;
  region: string;
  zipCodes: string[];
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  status: string;
  launchDate: string | null;
  launchedAt: string | null;
  minProvidersToLaunch: number;
  activeProviderCount: number;
  activeCustomerCount: number;
  totalBookings: number;
  isDefault: boolean;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: ServiceArea[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface AreaStats {
  success: boolean;
  data: {
    totalAreas: number;
    activeAreas: number;
    totalProviders: number;
    totalWaitlist: number;
    pendingWaitlist?: number;
    waitlistNotified?: number;
    areasByStatus: Record<string, number>;
  };
}

interface ServiceAreaChangeRequest {
  id: string;
  providerId: string;
  providerRecordId: string | null;
  providerName: string | null;
  providerEmail: string | null;
  providerPhone: string | null;
  currentAreaName: string | null;
  requestedAreaName: string | null;
  currentRadiusKm: number | null;
  requestedRadiusKm: number;
  requestedLatitude: number | null;
  requestedLongitude: number | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateAreaForm {
  name: string;
  city: string;
  province: string;
  region: string;
  centerLat: string;
  centerLng: string;
  radiusKm: string;
  minProvidersToLaunch: string;
  launchDate: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  soft_launch: 'success',
  recruiting: 'warning',
  planned: 'default',
  paused: 'danger',
  retired: 'default',
};

const CHANGE_STATUS_VARIANT: Record<ServiceAreaChangeRequest['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
};

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_OPTIONS = new Set(['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: string | null): string {
  return value && STATUS_OPTIONS.has(value) ? value : '';
}

const EMPTY_FORM: CreateAreaForm = {
  name: '', city: '', province: '', region: '',
  centerLat: '', centerLng: '', radiusKm: String(adminConfig.defaultServiceAreaRadiusKm),
  minProvidersToLaunch: String(adminConfig.defaultMinProvidersToLaunch), launchDate: '',
};

export default function ServiceAreasPage(): React.ReactElement {
  const { requestReason, reasonDialog } = useReasonDialog();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const search = searchParams.get('search')?.trim() ?? '';
  const providerFilter = searchParams.get('providerId')?.trim() ?? '';
  const rawAreaId = searchParams.get('areaId')?.trim() ?? '';
  const rawChangeRequestId = searchParams.get('changeRequestId')?.trim() ?? '';
  const hasAmbiguousExactSelection = Boolean(rawAreaId && rawChangeRequestId);
  const requestedAreaId = !hasAmbiguousExactSelection && UUID_REGEX.test(rawAreaId) ? rawAreaId.toLowerCase() : '';
  const requestedChangeRequestId = !hasAmbiguousExactSelection && UUID_REGEX.test(rawChangeRequestId)
    ? rawChangeRequestId.toLowerCase()
    : '';
  const [searchInput, setSearchInput] = useState(search);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreateAreaForm>({ ...EMPTY_FORM });
  const [actionError, setActionError] = useState('');
  const [formError, setFormError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  // Phase 200 — edit an existing market (rename, adjust radius / providers-to-launch).
  const [editTarget, setEditTarget] = useState<ServiceArea | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; radiusKm: string; minProvidersToLaunch: string }>({
    name: '', radiusKm: '', minProvidersToLaunch: '',
  });
  const [editError, setEditError] = useState('');
  const [decisionTarget, setDecisionTarget] = useState<{
    request: ServiceAreaChangeRequest;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch: refetchAreas } = useQuery({
    queryKey: ['adminServiceAreas', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/service-areas', { params });
      return res.data;
    },
  });

  const { data: statsData, isError: isStatsError, refetch: refetchStats } = useQuery({
    queryKey: ['adminServiceAreaStats'],
    queryFn: async () => {
      const res = await api.get<AreaStats>('/api/v1/admin/service-areas/stats');
      return res.data.data;
    },
  });

  const changeRequestsQuery = useQuery({
    queryKey: ['adminServiceAreaChanges', providerFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ServiceAreaChangeRequest[] }>(
        '/api/v1/admin/service-area-changes',
        { params: { limit: 200, ...(providerFilter ? { providerId: providerFilter } : {}) } },
      );
      return res.data.data;
    },
  });

  const exactAreaQuery = useQuery({
    queryKey: ['adminServiceAreas', 'exact', requestedAreaId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ServiceArea }>(
        `/api/v1/admin/service-areas/${requestedAreaId}`,
      );
      if (res.data.data.id !== requestedAreaId) {
        throw new Error('The service-area response did not match the selected audit record.');
      }
      return res.data.data;
    },
    enabled: Boolean(requestedAreaId),
    retry: false,
  });

  const exactChangeRequestQuery = useQuery({
    queryKey: ['adminServiceAreaChanges', 'exact', requestedChangeRequestId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ServiceAreaChangeRequest }>(
        `/api/v1/admin/service-area-changes/${requestedChangeRequestId}`,
      );
      if (res.data.data.id !== requestedChangeRequestId) {
        throw new Error('The area-change response did not match the selected audit record.');
      }
      return res.data.data;
    },
    enabled: Boolean(requestedChangeRequestId),
    retry: false,
  });

  const decideChangeMutation = useMutation({
    mutationFn: async ({ requestId, decision, reason }: {
      requestId: string;
      decision: 'approved' | 'rejected';
      reason: string;
    }) => {
      await api.post(`/api/v1/admin/service-area-changes/${requestId}/decide`, { decision, reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaChanges'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setDecisionTarget(null);
      setDecisionReason('');
      setDecisionError('');
    },
    onError: (error) => setDecisionError(getErrorMessage(error)),
  });

  const createMutation = useMutation({
    mutationFn: async ({ formData, reason }: { formData: CreateAreaForm; reason: string }) => {
      await api.post('/api/v1/admin/service-areas', {
        name: formData.name.trim(),
        city: formData.city.trim(),
        province: formData.province.trim(),
        region: formData.region.trim(),
        centerLat: Number(formData.centerLat),
        centerLng: Number(formData.centerLng),
        radiusKm: Number(formData.radiusKm),
        minProvidersToLaunch: Number(formData.minProvidersToLaunch),
        launchDate: formData.launchDate || undefined,
        reason,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setShowCreateForm(false);
      setForm({ ...EMPTY_FORM });
      setActionError('');
      setFormError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const activateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.post<{ message?: string }>(`/api/v1/admin/service-areas/${id}/activate`, { reason });
      return response.data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setActionError('');
      setActionNotice(result.message ?? 'Service area activated.');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const notifyWaitlistMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.post<{ data: { notifiedCount: number } }>(
        `/api/v1/admin/service-areas/${id}/notify-waitlist`,
        { reason },
      );
      return response.data.data.notifiedCount;
    },
    onSuccess: (notifiedCount) => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setActionError('');
      setActionNotice(`${notifiedCount} registered waitlist account${notifiedCount === 1 ? '' : 's'} notified. Entries without an account remain awaiting contact.`);
    },
    onError: (error) => {
      setActionNotice('');
      setActionError(getErrorMessage(error));
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/api/v1/admin/service-areas/${id}/pause`, { reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/api/v1/admin/service-areas/${id}/set-default`, { reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      await api.patch(`/api/v1/admin/service-areas/${id}`, updates);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setEditTarget(null);
      setEditError('');
    },
    onError: (e) => setEditError(getErrorMessage(e)),
  });

  function openEdit(area: ServiceArea): void {
    setEditTarget(area);
    setEditError('');
    setEditForm({
      name: area.name,
      radiusKm: String(area.radiusKm),
      minProvidersToLaunch: String(area.minProvidersToLaunch),
    });
  }

  async function submitEdit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!editTarget) return;
    const name = editForm.name.trim();
    const radius = Number(editForm.radiusKm);
    const minProviders = Number(editForm.minProvidersToLaunch);
    if (!name) { setEditError('Area name is required.'); return; }
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) { setEditError('Radius must be between 1 and 100 km.'); return; }
    if (!Number.isInteger(minProviders) || minProviders < 1 || minProviders > 50) { setEditError('Minimum providers to launch must be an integer from 1 to 50.'); return; }
    const reason = await requestReason({
      title: 'Save market configuration?',
      description: `This changes customer coverage and provider matching configuration for “${editTarget.name}”. Existing booking addresses are not rewritten.`,
      confirmLabel: 'Save changes',
      reasonLabel: 'Configuration reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    editMutation.mutate({
      id: editTarget.id,
      updates: { name, radiusKm: radius, minProvidersToLaunch: minProviders, reason },
    });
  }

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      return params;
    });
  };

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  function setStatusFilter(nextStatus: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (nextStatus) params.set('status', nextStatus);
      else params.delete('status');
      return params;
    });
  }

  function clearExactSelection(): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('areaId');
      params.delete('changeRequestId');
      return params;
    }, { replace: true });
  }

  function validateCreateForm(formData: CreateAreaForm): string | null {
    if (!formData.name.trim() || !formData.city.trim() || !formData.province.trim() || !formData.region.trim()) {
      return 'Area name, city, province, and region are required.';
    }
    const lat = Number(formData.centerLat);
    const lng = Number(formData.centerLng);
    const radius = Number(formData.radiusKm);
    const minProviders = Number(formData.minProvidersToLaunch);
    // Phase 200 — align client bounds with server createServiceAreaSchema:
    // Philippines lat 4.5..21.5, lng 116..127.5, radius 1..100 km.
    if (!Number.isFinite(lat) || lat < 4.5 || lat > 21.5) return 'Center latitude must be within Philippines bounds (4.5 to 21.5).';
    if (!Number.isFinite(lng) || lng < 116 || lng > 127.5) return 'Center longitude must be within Philippines bounds (116 to 127.5).';
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) return 'Radius must be between 1 and 100 km.';
    if (!Number.isInteger(minProviders) || minProviders < 1 || minProviders > 50) return 'Minimum providers to launch must be an integer from 1 to 50.';
    return null;
  }

  const handleCreateSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const validationError = validateCreateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const reason = await requestReason({
      title: 'Create service area?',
      description: `Create “${form.name.trim()}” in ${form.city.trim()}, ${form.province.trim()} with a ${form.radiusKm} km matching radius. It will not accept customer bookings until activated.`,
      confirmLabel: 'Create area',
      reasonLabel: 'Planning reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    setFormError('');
    createMutation.mutate({ formData: form, reason });
  };

  async function activateArea(area: ServiceArea): Promise<void> {
    const reason = await requestReason({
      title: 'Activate service area?',
      description: `“${area.name}” will begin accepting customer bookings and provider matching. ${area.activeProviderCount} approved providers are assigned against a configured minimum of ${area.minProvidersToLaunch}. Registered waitlist users with accounts will receive an in-app notice; other entries remain awaiting contact.`,
      confirmLabel: 'Activate area',
      reasonLabel: 'Activation reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    activateMutation.mutate({ id: area.id, reason });
  }

  async function notifyAreaWaitlist(area: ServiceArea): Promise<void> {
    const reason = await requestReason({
      title: 'Retry waitlist notices?',
      description: `Send an in-app launch notice to registered accounts waiting for “${area.name}”. Entries without an onService account remain awaiting manual contact.`,
      confirmLabel: 'Send notices',
      reasonLabel: 'Notification reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    notifyWaitlistMutation.mutate({ id: area.id, reason });
  }

  async function pauseArea(area: ServiceArea): Promise<void> {
    const reason = await requestReason({
      title: 'Pause service area?',
      description: `“${area.name}” will stop accepting new customer bookings and provider service-area requests. Existing bookings are not cancelled by this action.`,
      confirmLabel: 'Pause area',
      reasonLabel: 'Pause reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    pauseMutation.mutate({ id: area.id, reason });
  }

  async function setDefaultArea(area: ServiceArea): Promise<void> {
    const reason = await requestReason({
      title: 'Change the app default city?',
      description: `Customer and provider maps and location pickers will default to “${area.name}”. This changes the starting market, not a user’s saved address or an existing booking.`,
      confirmLabel: 'Set as default',
      reasonLabel: 'Default-market reason',
      minLength: 10,
      maxLength: 2000,
    });
    if (!reason) return;
    setDefaultMutation.mutate({ id: area.id, reason });
  }

  function openDecision(request: ServiceAreaChangeRequest, decision: 'approved' | 'rejected'): void {
    setDecisionTarget({ request, decision });
    setDecisionReason('');
    setDecisionError('');
  }

  function submitDecision(e: FormEvent): void {
    e.preventDefault();
    if (!decisionTarget) return;
    const trimmed = decisionReason.trim();
    if (trimmed.length < 30) {
      setDecisionError('Decision reason must be at least 30 characters.');
      return;
    }
    if (trimmed.length > 5000) {
      setDecisionError('Decision reason cannot exceed 5,000 characters.');
      return;
    }
    decideChangeMutation.mutate({
      requestId: decisionTarget.request.id,
      decision: decisionTarget.decision,
      reason: trimmed,
    });
  }

  const columns: Column<ServiceArea>[] = [
    {
      key: 'name',
      header: 'Area',
      render: (r) => (
        <div>
          <span className="flex items-center gap-2 font-semibold text-sm text-[var(--color-text)]">
            {r.name}
            {r.isDefault && <Badge variant="success" label="Default" />}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">{r.city}, {r.province}</span>
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Region',
      render: (r) => <span className="text-sm text-[var(--color-text)]">{r.region}</span>,
    },
    {
      key: 'radiusKm',
      header: 'Radius',
      render: (r) => <span className="text-sm">{r.radiusKm} km</span>,
    },
    {
      key: 'activeProviderCount',
      header: 'Approved providers',
      render: (r) => (
        <div>
          <Link
            to={`/providers?serviceAreaId=${encodeURIComponent(r.id)}&status=approved`}
            className="text-sm font-medium text-[var(--color-primary)] hover:underline"
            aria-label={`Open providers assigned to ${r.name}`}
          >
            {r.activeProviderCount}
          </Link>
          <span className="text-xs text-[var(--color-text-secondary)]"> / {r.minProvidersToLaunch} min</span>
        </div>
      ),
    },
    {
      key: 'activeCustomerCount',
      header: 'Customers',
      // BUG-PHASE42-01 fix — pre-fix activeCustomerCount was on the
      // ServiceArea interface and returned by the API but never
      // rendered in the table. Demand-side metric is as critical to
      // ops as supply-side; the page now surfaces it.
      render: (r) => (
        <span className="text-sm font-medium">{r.activeCustomerCount.toLocaleString()}</span>
      ),
    },
    {
      key: 'totalBookings',
      header: 'Bookings',
      render: (r) => <span className="text-sm">{r.totalBookings.toLocaleString()}</span>,
    },
    {
      key: 'launchDate',
      header: 'Launch',
      render: (r) => (
        <span className="text-sm text-[var(--color-text)]">
          {r.launchedAt
            ? new Date(r.launchedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
            : r.launchDate
            ? `Planned: ${new Date(r.launchDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? 'default'} label={formatStatus(r.status)} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex flex-wrap justify-end gap-2">
          {isSuperAdmin && <button
            type="button"
            aria-label={`Edit service area ${r.name}`}
            onClick={() => openEdit(r)}
            className="min-h-11 rounded-md px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-slate-100"
          >
            Edit
          </button>}
          {isSuperAdmin && ['planned', 'recruiting', 'soft_launch'].includes(r.status) && (
            <button
              type="button"
              aria-label={r.activeProviderCount < r.minProvidersToLaunch
                ? `Cannot activate service area ${r.name}; ${r.minProvidersToLaunch - r.activeProviderCount} more approved providers required`
                : `Activate service area ${r.name}`}
              onClick={() => void activateArea(r)}
              disabled={activateMutation.isPending || r.activeProviderCount < r.minProvidersToLaunch}
              title={r.activeProviderCount < r.minProvidersToLaunch
                ? `${r.minProvidersToLaunch - r.activeProviderCount} more approved providers are required before activation.`
                : undefined}
              className="min-h-11 rounded-md px-3 py-2 text-xs text-[var(--color-primary)] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {r.activeProviderCount < r.minProvidersToLaunch ? 'Supply below minimum' : 'Activate'}
            </button>
          )}
          {isSuperAdmin && r.status === 'active' && (
            <button
              type="button"
              aria-label={r.isDefault
                ? `Cannot pause default service area ${r.name}; choose another default first`
                : `Pause service area ${r.name}`}
              onClick={() => void pauseArea(r)}
              disabled={pauseMutation.isPending || r.isDefault}
              title={r.isDefault ? 'Choose another active or soft-launch default before pausing this market.' : undefined}
              className="min-h-11 rounded-md px-3 py-2 text-xs text-[var(--color-error)] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {r.isDefault ? 'Default cannot pause' : 'Pause'}
            </button>
          )}
          {isSuperAdmin && r.status === 'active' && (
            <button
              type="button"
              aria-label={`Retry waitlist notices for ${r.name}`}
              onClick={() => void notifyAreaWaitlist(r)}
              disabled={notifyWaitlistMutation.isPending}
              className="min-h-11 rounded-md px-3 py-2 text-xs text-[var(--color-primary)] hover:bg-sky-50 disabled:opacity-50"
            >
              Notify waitlist
            </button>
          )}
          {isSuperAdmin && !r.isDefault && ['active', 'soft_launch'].includes(r.status) && (
            <button
              type="button"
              aria-label={`Set ${r.name} as the default city`}
              onClick={() => void setDefaultArea(r)}
              disabled={setDefaultMutation.isPending}
              className="min-h-11 rounded-md px-3 py-2 text-xs text-[var(--color-primary)] hover:bg-emerald-50 disabled:opacity-50"
            >
              Set default
            </button>
          )}
        </div>
      ),
    },
  ];

  const areas = data?.data ?? [];
  const pagination = data?.pagination;
  const stats = statsData;
  const allPendingRequests = changeRequestsQuery.data ?? [];
  const pendingRequests = providerFilter
    ? allPendingRequests.filter((request) => request.providerRecordId === providerFilter)
    : allPendingRequests;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Service Areas</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Control customer-bookable markets, provider coverage, capacity, and reviewed provider change requests.</p>
        </div>
        {isSuperAdmin && <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
        >
          {showCreateForm ? 'Cancel' : 'Add Area'}
        </button>}
      </div>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">Read-only market access</p>
          <p className="mt-1">You can inspect coverage, capacity, and provider requests. Creating markets or changing customer and provider availability requires a super admin.</p>
        </div>
      )}

      {(rawAreaId || rawChangeRequestId) && (
        <section aria-labelledby="selected-market-evidence-title" className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Selected audit evidence</p>
              <h2 id="selected-market-evidence-title" className="mt-1 text-lg font-semibold text-[var(--color-text)]">Exact market operations record</h2>
            </div>
            <button type="button" onClick={clearExactSelection} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">Clear selection</button>
          </div>

          {hasAmbiguousExactSelection || (rawAreaId && !requestedAreaId) || (rawChangeRequestId && !requestedChangeRequestId) ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">
              The audit link must contain one valid service-area or change-request ID. No market record was loaded.
            </p>
          ) : requestedAreaId ? (
            exactAreaQuery.isLoading ? (
              <div className="mt-4 h-24 animate-pulse rounded-lg bg-white" aria-label="Loading selected service area" />
            ) : exactAreaQuery.isError || !exactAreaQuery.data ? (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">The exact service area could not be loaded. No other market was substituted.</p>
            ) : (
              <div className="mt-4 rounded-lg border border-sky-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold text-[var(--color-text)]">{exactAreaQuery.data.name}</p><p className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">{exactAreaQuery.data.id}</p></div>
                  <Badge variant={STATUS_VARIANT[exactAreaQuery.data.status] ?? 'default'} label={formatStatus(exactAreaQuery.data.status)} />
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Location</dt><dd className="mt-1">{exactAreaQuery.data.city}, {exactAreaQuery.data.province} · {exactAreaQuery.data.region}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Coverage</dt><dd className="mt-1">{exactAreaQuery.data.radiusKm} km radius</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Approved supply</dt><dd className="mt-1">{exactAreaQuery.data.activeProviderCount} / {exactAreaQuery.data.minProvidersToLaunch} minimum</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Recorded activity</dt><dd className="mt-1">{exactAreaQuery.data.activeCustomerCount} customers · {exactAreaQuery.data.totalBookings} bookings</dd></div>
                </dl>
              </div>
            )
          ) : requestedChangeRequestId ? (
            exactChangeRequestQuery.isLoading ? (
              <div className="mt-4 h-32 animate-pulse rounded-lg bg-white" aria-label="Loading selected provider area-change request" />
            ) : exactChangeRequestQuery.isError || !exactChangeRequestQuery.data ? (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">The exact provider area-change decision could not be loaded. No pending request was substituted.</p>
            ) : (
              <div className="mt-4 rounded-lg border border-sky-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {exactChangeRequestQuery.data.providerRecordId ? (
                      <Link className="font-semibold text-[var(--color-primary)] hover:underline" to={`/providers/${exactChangeRequestQuery.data.providerRecordId}`}>{exactChangeRequestQuery.data.providerName || 'Open Provider 360'}</Link>
                    ) : <p className="font-semibold text-[var(--color-text)]">{exactChangeRequestQuery.data.providerName || 'Provider account unavailable'}</p>}
                    <p className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">{exactChangeRequestQuery.data.id}</p>
                  </div>
                  <Badge variant={CHANGE_STATUS_VARIANT[exactChangeRequestQuery.data.status]} label={formatStatus(exactChangeRequestQuery.data.status)} />
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-[var(--color-surface-muted)] p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Requested change</dt><dd className="mt-1">{exactChangeRequestQuery.data.currentAreaName || 'No primary area'} → {exactChangeRequestQuery.data.requestedAreaName || 'Unknown area'} · {exactChangeRequestQuery.data.requestedRadiusKm} km</dd></div>
                  <div className="rounded-lg bg-[var(--color-surface-muted)] p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Reviewed pin</dt><dd className="mt-1 font-mono text-xs">{exactChangeRequestQuery.data.requestedLatitude != null && exactChangeRequestQuery.data.requestedLongitude != null ? `${exactChangeRequestQuery.data.requestedLatitude.toFixed(5)}, ${exactChangeRequestQuery.data.requestedLongitude.toFixed(5)}` : 'Missing'}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Provider context</dt><dd className="mt-1 whitespace-pre-wrap">{exactChangeRequestQuery.data.reason || 'No reason supplied.'}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Decision evidence</dt><dd className="mt-1 whitespace-pre-wrap">{exactChangeRequestQuery.data.decisionReason || 'No decision recorded.'}{exactChangeRequestQuery.data.reviewedAt ? ` · ${new Date(exactChangeRequestQuery.data.reviewedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : ''}</dd></div>
                </dl>
              </div>
            )
          ) : null}
        </section>
      )}

      {isStatsError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <span>Failed to load area statistics.</span>
        <button type="button" onClick={() => { void refetchStats(); }} className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold">Retry statistics</button>
      </div>}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Total Areas</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalAreas}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Bookable Areas</p>
            <p className="text-2xl font-bold text-[var(--color-primary)]">{stats.activeAreas}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Approved Providers</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalProviders}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Waitlist Total</p>
            <p className="text-2xl font-bold text-[var(--color-warning)]">{stats.totalWaitlist}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Awaiting Notice</p>
            <p className="text-2xl font-bold text-amber-700">{stats.pendingWaitlist ?? stats.totalWaitlist}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Notified</p>
            <p className="text-2xl font-bold text-emerald-700">{stats.waitlistNotified ?? 0}</p>
          </div>
        </div>
      )}

      <section aria-labelledby="provider-area-change-title" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="provider-area-change-title" className="text-lg font-semibold text-[var(--color-text)]">Provider Change Requests</h2>
              <Badge variant={pendingRequests.length > 0 ? 'warning' : 'success'} label={`${pendingRequests.length} pending`} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Review the requested market, location pin, and radius before changing provider matching coverage.</p>
            {providerFilter && (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-md px-2 py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] hover:underline"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('providerId');
                  setSearchParams(next);
                }}
              >
                Showing one Provider 360 record · clear provider filter
              </button>
            )}
          </div>
          {!isSuperAdmin && (
            <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">Visible to support. Approval and rejection require super admin.</p>
          )}
        </div>

        {changeRequestsQuery.isLoading && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Loading provider requests…</p>}
        {changeRequestsQuery.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-error)]">
          <span>Failed to load provider service-area requests.</span>
          <button type="button" onClick={() => { void changeRequestsQuery.refetch(); }} className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold">Retry requests</button>
        </div>}
        {!changeRequestsQuery.isLoading && !changeRequestsQuery.isError && pendingRequests.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-5 text-center text-sm text-[var(--color-text-secondary)]">
            {providerFilter
              ? 'This provider has no service-area changes waiting for review.'
              : 'No provider service-area changes are waiting for review.'}
          </div>
        )}
        {pendingRequests.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {pendingRequests.map((request) => (
              <article key={request.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {request.providerRecordId ? (
                      <Link className="font-semibold text-[var(--color-primary)] hover:underline" to={`/providers/${request.providerRecordId}`}>
                        {request.providerName || request.providerEmail || request.providerPhone || 'Open Provider 360'}
                      </Link>
                    ) : (
                      <p className="font-semibold text-[var(--color-text)]">{request.providerName || request.providerEmail || request.providerPhone || 'Provider account unavailable'}</p>
                    )}
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Submitted {new Date(request.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</p>
                  </div>
                  <Badge variant="warning" label="Pending review" />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Current</p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{request.currentAreaName || 'No primary area'}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{request.currentRadiusKm ?? 0} km radius</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Requested</p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{request.requestedAreaName || 'Unknown area'}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{request.requestedRadiusKm} km radius</p>
                  </div>
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-[var(--color-text-secondary)]">Reviewed pin</dt>
                    <dd className="font-mono text-xs text-[var(--color-text)]">
                      {request.requestedLatitude != null && request.requestedLongitude != null
                        ? `${request.requestedLatitude.toFixed(5)}, ${request.requestedLongitude.toFixed(5)}`
                        : 'Missing'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-secondary)]">Provider context</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[var(--color-text)]">{request.reason || 'No reason supplied.'}</dd>
                  </div>
                </dl>

                {isSuperAdmin && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => openDecision(request, 'rejected')} className="min-h-11 rounded-lg border border-[var(--color-error)] px-3 py-2 text-sm font-medium text-[var(--color-error)] hover:bg-red-50">Reject</button>
                    <button type="button" onClick={() => openDecision(request, 'approved')} className="min-h-11 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]">Approve</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} noValidate className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">New Service Area</h2>
          {formError && <p role="alert" className="text-sm text-[var(--color-error)]">{formError}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="area-name" className="block text-sm font-medium text-[var(--color-text)] mb-1">Area Name</label>
              <input id="area-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Cagayan de Oro Metro"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-city" className="block text-sm font-medium text-[var(--color-text)] mb-1">City / Municipality</label>
              <input id="area-city" type="text" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g., Cagayan de Oro City"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-province" className="block text-sm font-medium text-[var(--color-text)] mb-1">Province</label>
              <input id="area-province" type="text" required value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}
                placeholder="e.g., Misamis Oriental"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-region" className="block text-sm font-medium text-[var(--color-text)] mb-1">Region</label>
              <input id="area-region" type="text" required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="e.g., Region X - Northern Mindanao"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-lat" className="block text-sm font-medium text-[var(--color-text)] mb-1">Center Latitude</label>
              <input id="area-lat" type="number" step="any" required value={form.centerLat} onChange={(e) => setForm({ ...form, centerLat: e.target.value })}
                placeholder="e.g., 8.4542"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-lng" className="block text-sm font-medium text-[var(--color-text)] mb-1">Center Longitude</label>
              <input id="area-lng" type="number" step="any" required value={form.centerLng} onChange={(e) => setForm({ ...form, centerLng: e.target.value })}
                placeholder="e.g., 124.6319"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-radius" className="block text-sm font-medium text-[var(--color-text)] mb-1">Radius (km)</label>
              {/* Phase 200 — raised max from 50 to 100 to match server bound. */}
              <input id="area-radius" type="number" min="1" max="100" value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-min-providers" className="block text-sm font-medium text-[var(--color-text)] mb-1">Min Providers to Launch</label>
              <input id="area-min-providers" type="number" min="1" max="50" value={form.minProvidersToLaunch} onChange={(e) => setForm({ ...form, minProvidersToLaunch: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label htmlFor="area-launch-date" className="block text-sm font-medium text-[var(--color-text)] mb-1">Target Launch Date</label>
              <input id="area-launch-date" type="date" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending}
              className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
              {createMutation.isPending ? 'Creating...' : 'Create Area'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)}
              className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">Failed to create service area. Please try again.</p>
          )}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            id="service-area-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search areas..."
            aria-label="Search service areas by name"
            maxLength={100}
            className="min-h-11 min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <button type="submit"
            className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]">
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter service areas by status"
          className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">All Statuses</option>
          <option value="planned">Planned</option>
          <option value="recruiting">Recruiting</option>
          <option value="soft_launch">Soft Launch</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {isError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <span>Failed to load service areas.</span>
        <button type="button" onClick={() => { void refetchAreas(); }} className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 font-semibold">Retry service areas</button>
      </div>}
      {actionError && <p role="alert" className="text-sm text-red-600 mb-4">{actionError}</p>}
      {actionNotice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionNotice}</p>}

      {!isError && (
        <>
          <DataTable columns={columns} data={areas} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No service areas found." />

          {pagination && pagination.totalPages > 1 && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {decisionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="area-change-decision-title" className="w-full max-w-lg rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
            <h3 id="area-change-decision-title" className="text-lg font-semibold text-[var(--color-text)]">
              {decisionTarget.decision === 'approved' ? 'Approve' : 'Reject'} provider service-area change
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {decisionTarget.request.providerName || decisionTarget.request.providerEmail || 'Provider'}: {decisionTarget.request.currentAreaName || 'No primary area'} → {decisionTarget.request.requestedAreaName || 'Requested area'} · {decisionTarget.request.requestedRadiusKm} km
            </p>
            <form onSubmit={submitDecision} className="mt-4 space-y-3">
              <div>
                <label htmlFor="area-change-decision-reason" className="block text-sm font-medium text-[var(--color-text)]">Decision reason</label>
                <textarea
                  id="area-change-decision-reason"
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Record what you checked and why this decision is appropriate. Minimum 30 characters."
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                />
                <p className="mt-1 text-right text-xs text-[var(--color-text-secondary)]">{decisionReason.length}/5,000</p>
              </div>
              {decisionError && <p role="alert" className="text-sm text-[var(--color-error)]">{decisionError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDecisionTarget(null)} disabled={decideChangeMutation.isPending} className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] disabled:opacity-50">Cancel</button>
                <button
                  type="submit"
                  disabled={decideChangeMutation.isPending}
                  className={decisionTarget.decision === 'approved'
                    ? 'min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
                    : 'min-h-11 rounded-lg bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50'}
                >
                  {decideChangeMutation.isPending ? 'Saving…' : decisionTarget.decision === 'approved' ? 'Approve change' : 'Reject change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-area-title"
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h3 id="edit-area-title" className="text-lg font-semibold text-[var(--color-text)] mb-1">Edit service area</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">{editTarget.city}, {editTarget.province}</p>
            <form onSubmit={submitEdit} noValidate className="space-y-3">
              <div>
                <label htmlFor="edit-area-name" className="block text-sm font-medium text-[var(--color-text)] mb-1">Area name</label>
                <input id="edit-area-name" type="text" value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-area-radius" className="block text-sm font-medium text-[var(--color-text)] mb-1">Radius (km)</label>
                  <input id="edit-area-radius" type="number" min="1" max="100" value={editForm.radiusKm}
                    onChange={(e) => setEditForm({ ...editForm, radiusKm: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label htmlFor="edit-area-minprov" className="block text-sm font-medium text-[var(--color-text)] mb-1">Min providers to launch</label>
                  <input id="edit-area-minprov" type="number" min="1" max="50" value={editForm.minProvidersToLaunch}
                    onChange={(e) => setEditForm({ ...editForm, minProvidersToLaunch: e.target.value })}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
                </div>
              </div>
              {editError && <p role="alert" className="text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={editMutation.isPending}
                  className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                  {editMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {reasonDialog}
    </div>
  );
}
