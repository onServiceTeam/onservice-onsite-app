import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';

interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string;
  updated_at: string;
  staff_count?: number | string;
}

function getStaffCount(role: AdminRole): number {
  return parseInt(String(role.staff_count ?? '0'), 10) || 0;
}

interface AdminStaff {
  id: string;
  user_id: string;
  role_id: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  user_phone?: string;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  role_name?: string;
}

type TabId = 'staff' | 'roles';

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PermissionBadge({ perm }: { perm: string }): React.ReactElement {
  const [scope, action] = perm.split('.');
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
      {scope}.{action}
    </span>
  );
}

// ─── Roles Tab ──────────────────────────────────────────────────────

function RolesTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [error, setError] = useState('');

  const { data: roles, isLoading, isError: isRolesError } = useQuery({
    queryKey: ['adminRoles'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/roles');
      return res.data.data as AdminRole[];
    },
  });

  const { data: allPermissions, isError: isPermsError } = useQuery({
    queryKey: ['adminPermissions'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/permissions');
      return res.data.data as string[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (params: { name: string; description: string; permissions: string[] }) => {
      await api.post('/api/v1/staff/roles', params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminRoles'] }); resetForm(); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...params }: { id: string; name: string; description: string; permissions: string[] }) => {
      await api.put(`/api/v1/staff/roles/${id}`, params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminRoles'] }); resetForm(); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/api/v1/staff/roles/${id}`); },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminRoles'] }); setError(''); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  function resetForm(): void {
    setEditing(null);
    setCreating(false);
    setFormName('');
    setFormDesc('');
    setFormPerms([]);
    setError('');
  }

  function startEdit(role: AdminRole): void {
    if (role.name === 'super_admin') return;
    setEditing(role);
    setCreating(false);
    setFormName(role.name);
    setFormDesc(role.description ?? '');
    setFormPerms([...role.permissions]);
    setError('');
  }

  function togglePerm(perm: string): void {
    setFormPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!formName.trim()) return;
    const payload = { name: formName.trim(), description: formDesc.trim(), permissions: formPerms };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const showForm = creating || editing;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Roles</h2>
        {!showForm && (
          <button
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg"
            onClick={() => { setCreating(true); setEditing(null); }}
          >
            Create Role
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="flex gap-3">
            <input
              className="flex-1 border border-[var(--color-border)] rounded px-3 py-2 text-sm"
              placeholder="Role name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
            <input
              className="flex-1 border border-[var(--color-border)] rounded px-3 py-2 text-sm"
              placeholder="Description"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)] mb-2">Permissions</p>
            <div className="flex flex-wrap gap-2">
              {(allPermissions ?? []).map((perm) => (
                <label key={perm} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={formPerms.includes(perm)} onChange={() => togglePerm(perm)} />
                  {perm}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg">
              {editing ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-[var(--color-border)] text-sm rounded-lg">
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>}
      {(isRolesError || isPermsError) && <p className="text-sm text-red-600">Failed to load roles. Please try again.</p>}

      <div className="grid gap-3">
        {(roles ?? []).map((role) => (
          <div key={role.id} className="bg-white border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-[var(--color-text)]">{formatLabel(role.name)}</h3>
                {role.description && <p className="text-sm text-[var(--color-text-secondary)]">{role.description}</p>}
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{getStaffCount(role)} staff members</p>
              </div>
              <div className="flex gap-2">
                {role.name !== 'super_admin' && (
                  <button className="text-sm text-[var(--color-primary)] hover:underline" onClick={() => startEdit(role)}>
                    Edit
                  </button>
                )}
                {getStaffCount(role) === 0 && role.name !== 'super_admin' && (
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteMutation.mutate(role.id); }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {role.permissions.map((p) => <PermissionBadge key={p} perm={p} />)}
            </div>
          </div>
        ))}
      </div>

      {!showForm && error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
    </div>
  );
}

// ─── Staff Tab ──────────────────────────────────────────────────────

function StaffTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRoleId, setAddRoleId] = useState('');
  const [error, setError] = useState('');
  // BUG-PHASE44-01 fix — pre-fix the role-change dropdown fired a
  // PUT immediately on selection with no confirmation. For a tool
  // that grants or revokes admin permissions, one-click changes
  // are dangerous (an accidental click could promote someone to
  // super_admin-equivalent). Now: dropdown stages the change and
  // a confirm dialog is required before commit.
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    staff: AdminStaff;
    newRoleId: string;
    newRoleName: string;
  } | null>(null);
  const limit = adminConfig.defaultPageSize;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminStaff', page],
    queryFn: async () => {
      const res = await api.get(`/api/v1/staff?page=${page}&limit=${limit}`);
      return res.data as { data: AdminStaff[]; meta: { total: number } };
    },
  });

  const { data: roles, isError: isRolesError } = useQuery({
    queryKey: ['adminRoles'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/roles');
      return res.data.data as AdminRole[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (params: { userId: string; roleId: string }) => {
      await api.post('/api/v1/staff', params);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      setShowAdd(false);
      setAddUserId('');
      setAddRoleId('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...params }: { id: string; roleId?: string; isActive?: boolean }) => {
      await api.put(`/api/v1/staff/${id}`, params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminStaff'] }); setError(''); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/api/v1/staff/${id}`); },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminStaff'] }); setError(''); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const columns: Column<AdminStaff>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div>
          <span className="font-medium">{r.user_first_name ?? ''} {r.user_last_name ?? ''}</span>
          {r.user_email && <p className="text-xs text-[var(--color-text-secondary)]">{r.user_email}</p>}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (r) => r.user_phone ?? '—' },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <select
          className="text-sm border border-[var(--color-border)] rounded px-2 py-1"
          value={r.role_id}
          onChange={(e) => {
            const newRoleId = e.target.value;
            if (newRoleId === r.role_id) return;
            const newRoleName = (roles ?? []).find((rr) => rr.id === newRoleId)?.name ?? '(unknown)';
            // Stage the change for confirmation rather than firing
            // immediately (BUG-PHASE44-01).
            setPendingRoleChange({ staff: r, newRoleId, newRoleName });
            // Reset the visible select back so the UI doesn't show
            // a stale optimistic selection if the dialog is cancelled.
            e.target.value = r.role_id;
          }}
        >
          {(roles ?? []).map((role) => (
            <option key={role.id} value={role.id}>{formatLabel(role.name)}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (r) => (
        <Badge variant={r.is_active ? 'success' : 'outline'} label={r.is_active ? 'Active' : 'Inactive'} />
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (r) => r.last_login_at
        ? new Date(r.last_login_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Never',
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex gap-2">
          <button
            className="text-sm text-[var(--color-primary)] hover:underline"
            onClick={() => updateMutation.mutate({ id: r.id, isActive: !r.is_active })}
          >
            {r.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={() => { if (confirm('Remove this staff member?')) removeMutation.mutate(r.id); }}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Staff Members</h2>
        <button
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg"
          onClick={() => setShowAdd(!showAdd)}
        >
          Add Staff
        </button>
      </div>

      {showAdd && (
        <form
          className="bg-white border border-[var(--color-border)] rounded-lg p-4 flex gap-3 items-end"
          onSubmit={(e) => { e.preventDefault(); addMutation.mutate({ userId: addUserId, roleId: addRoleId }); }}
        >
          <div className="flex-1">
            <label className="text-xs text-[var(--color-text-secondary)]">User ID</label>
            <input
              className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm mt-1"
              placeholder="Enter user ID"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[var(--color-text-secondary)]">Role</label>
            <select
              className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm mt-1"
              value={addRoleId}
              onChange={(e) => setAddRoleId(e.target.value)}
              required
            >
              <option value="">Select role</option>
              {(roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>{formatLabel(role.name)}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg">
            Add
          </button>
        </form>
      )}

      {isError && <p className="text-sm text-red-600">Failed to load staff members. Please try again.</p>}
      {isRolesError && <p className="text-sm text-red-600">Failed to load roles for assignment. Please refresh.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No staff members." />

      {data && (
        <Pagination
          page={page}
          totalPages={Math.ceil((data.meta?.total ?? 0) / limit)}
          total={data.meta?.total ?? 0}
          pageSize={limit}
          onPageChange={setPage}
        />
      )}

      {pendingRoleChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">
              Change role
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {pendingRoleChange.staff.user_first_name} {pendingRoleChange.staff.user_last_name}
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-sm text-[var(--color-text)]">
              <p>
                Change role from <strong>{formatLabel(pendingRoleChange.staff.role_name ?? '—')}</strong>{' '}
                to <strong>{formatLabel(pendingRoleChange.newRoleName)}</strong>?
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                This grants/revokes admin permissions immediately and is recorded in the audit log.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingRoleChange(null)}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({
                    id: pendingRoleChange.staff.id,
                    roleId: pendingRoleChange.newRoleId,
                  });
                  setPendingRoleChange(null);
                }}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {updateMutation.isPending ? 'Updating...' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function StaffRolesPage(): React.ReactElement {
  const [tab, setTab] = useState<TabId>('staff');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Staff & Roles</h1>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {([['staff', 'Staff'], ['roles', 'Roles & Permissions']] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab />}
      {tab === 'roles' && <RolesTab />}
    </div>
  );
}
