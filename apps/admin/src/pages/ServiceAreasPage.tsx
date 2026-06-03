import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

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
    areasByStatus: Record<string, number>;
  };
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

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_OPTIONS = new Set(['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired']);

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
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const statusFilter = parseStatus(searchParams.get('status'));
  const search = searchParams.get('search')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreateAreaForm>({ ...EMPTY_FORM });
  const [actionError, setActionError] = useState('');
  const [formError, setFormError] = useState('');
  // Phase 200 — edit an existing market (rename, adjust radius / providers-to-launch).
  const [editTarget, setEditTarget] = useState<ServiceArea | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; radiusKm: string; minProvidersToLaunch: string }>({
    name: '', radiusKm: '', minProvidersToLaunch: '',
  });
  const [editError, setEditError] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminServiceAreas', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/service-areas', { params });
      return res.data;
    },
  });

  const { data: statsData, isError: isStatsError } = useQuery({
    queryKey: ['adminServiceAreaStats'],
    queryFn: async () => {
      const res = await api.get<AreaStats>('/api/v1/admin/service-areas/stats');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: CreateAreaForm) => {
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
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/service-areas/${id}/activate`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/service-areas/${id}/pause`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setActionError('');
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/admin/service-areas/${id}/set-default`);
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

  function submitEdit(e: FormEvent): void {
    e.preventDefault();
    if (!editTarget) return;
    const name = editForm.name.trim();
    const radius = Number(editForm.radiusKm);
    const minProviders = Number(editForm.minProvidersToLaunch);
    if (!name) { setEditError('Area name is required.'); return; }
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) { setEditError('Radius must be between 1 and 100 km.'); return; }
    if (!Number.isInteger(minProviders) || minProviders < 1 || minProviders > 50) { setEditError('Minimum providers to launch must be an integer from 1 to 50.'); return; }
    editMutation.mutate({ id: editTarget.id, updates: { name, radiusKm: radius, minProvidersToLaunch: minProviders } });
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

  const handleCreateSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const validationError = validateCreateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (!window.confirm(`Create service area "${form.name.trim()}"?`)) return;
    setFormError('');
    createMutation.mutate(form);
  };

  function activateArea(area: ServiceArea): void {
    if (!window.confirm(`Activate service area "${area.name}"?`)) return;
    activateMutation.mutate(area.id);
  }

  function pauseArea(area: ServiceArea): void {
    if (!window.confirm(`Pause service area "${area.name}"?`)) return;
    pauseMutation.mutate(area.id);
  }

  function setDefaultArea(area: ServiceArea): void {
    if (!window.confirm(`Make "${area.name}" the default city? The mobile apps will center their map and default their location pickers here.`)) return;
    setDefaultMutation.mutate(area.id);
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
      header: 'Providers',
      render: (r) => (
        <div>
          <span className="text-sm font-medium">{r.activeProviderCount}</span>
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
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={`Edit service area ${r.name}`}
            onClick={() => openEdit(r)}
            className="text-xs text-[var(--color-text-secondary)] hover:underline"
          >
            Edit
          </button>
          {['planned', 'recruiting', 'soft_launch'].includes(r.status) && (
            <button
              type="button"
              aria-label={`Activate service area ${r.name}`}
              onClick={() => activateArea(r)}
              disabled={activateMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {r.status === 'active' && (
            <button
              type="button"
              aria-label={`Pause service area ${r.name}`}
              onClick={() => pauseArea(r)}
              disabled={pauseMutation.isPending}
              className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {!r.isDefault && ['active', 'soft_launch'].includes(r.status) && (
            <button
              type="button"
              aria-label={`Set ${r.name} as the default city`}
              onClick={() => setDefaultArea(r)}
              disabled={setDefaultMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Service Areas</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
        >
          {showCreateForm ? 'Cancel' : 'Add Area'}
        </button>
      </div>

      {isStatsError && <p className="text-sm text-red-600 mb-2">Failed to load area statistics.</p>}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Total Areas</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalAreas}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Active</p>
            <p className="text-2xl font-bold text-[var(--color-primary)]">{stats.activeAreas}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Providers</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalProviders}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Waitlist</p>
            <p className="text-2xl font-bold text-[var(--color-warning)]">{stats.totalWaitlist}</p>
          </div>
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} noValidate className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">New Service Area</h2>
          {formError && <p role="alert" className="text-sm text-[var(--color-error)]">{formError}</p>}
          <div className="grid grid-cols-2 gap-4">
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
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
              {createMutation.isPending ? 'Creating...' : 'Create Area'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">Failed to create service area. Please try again.</p>
          )}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            id="service-area-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search areas..."
            aria-label="Search service areas by name"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <button type="submit"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]">
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter service areas by status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
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

      {isError && <p role="alert" className="text-sm text-red-600 mb-4">Failed to load service areas. Please try again.</p>}
      {actionError && <p role="alert" className="text-sm text-red-600 mb-4">{actionError}</p>}

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
              <div className="grid grid-cols-2 gap-3">
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
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={editMutation.isPending}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                  {editMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
