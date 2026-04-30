import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
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

const EMPTY_FORM: CreateAreaForm = {
  name: '', city: '', province: '', region: '',
  centerLat: '', centerLng: '', radiusKm: String(adminConfig.defaultServiceAreaRadiusKm),
  minProvidersToLaunch: String(adminConfig.defaultMinProvidersToLaunch), launchDate: '',
};

export default function ServiceAreasPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreateAreaForm>({ ...EMPTY_FORM });
  const [actionError, setActionError] = useState('');
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
        name: formData.name,
        city: formData.city,
        province: formData.province,
        region: formData.region,
        centerLat: Number(formData.centerLat),
        centerLng: Number(formData.centerLng),
        radiusKm: Number(formData.radiusKm) || adminConfig.defaultServiceAreaRadiusKm,
        minProvidersToLaunch: Number(formData.minProvidersToLaunch) || adminConfig.defaultMinProvidersToLaunch,
        launchDate: formData.launchDate || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreas'] });
      void queryClient.invalidateQueries({ queryKey: ['adminServiceAreaStats'] });
      setShowCreateForm(false);
      setForm({ ...EMPTY_FORM });
      setActionError('');
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

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleCreateSubmit = (e: FormEvent): void => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const columns: Column<ServiceArea>[] = [
    {
      key: 'name',
      header: 'Area',
      render: (r) => (
        <div>
          <span className="block font-semibold text-sm text-[var(--color-text)]">{r.name}</span>
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
          {['planned', 'recruiting', 'soft_launch'].includes(r.status) && (
            <button
              onClick={() => activateMutation.mutate(r.id)}
              disabled={activateMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {r.status === 'active' && (
            <button
              onClick={() => pauseMutation.mutate(r.id)}
              disabled={pauseMutation.isPending}
              className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
            >
              Pause
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
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
        >
          {showCreateForm ? 'Cancel' : 'Add Area'}
        </button>
      </div>

      {isStatsError && <p className="text-sm text-red-500 mb-2">Failed to load area statistics.</p>}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
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
        <form onSubmit={handleCreateSubmit} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">New Service Area</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Area Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Cagayan de Oro Metro"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">City / Municipality</label>
              <input type="text" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g., Cagayan de Oro City"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Province</label>
              <input type="text" required value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}
                placeholder="e.g., Misamis Oriental"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Region</label>
              <input type="text" required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="e.g., Region X - Northern Mindanao"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Center Latitude</label>
              <input type="number" step="any" required value={form.centerLat} onChange={(e) => setForm({ ...form, centerLat: e.target.value })}
                placeholder="e.g., 8.4542"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Center Longitude</label>
              <input type="number" step="any" required value={form.centerLng} onChange={(e) => setForm({ ...form, centerLng: e.target.value })}
                placeholder="e.g., 124.6319"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Radius (km)</label>
              <input type="number" min="1" max="50" value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Min Providers to Launch</label>
              <input type="number" min="1" value={form.minProvidersToLaunch} onChange={(e) => setForm({ ...form, minProvidersToLaunch: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Target Launch Date</label>
              <input type="date" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })}
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
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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

      {isError && <p className="text-sm text-red-500 mb-4">Failed to load service areas. Please try again.</p>}
      {actionError && <p className="text-sm text-red-500 mb-4">{actionError}</p>}

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
    </div>
  );
}
