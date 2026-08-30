import React, { useState, type FormEvent } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminConfig } from '@/config/admin.config';
import api, { getErrorMessage } from '@/lib/api';
import { Badge, Pagination } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';

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
  profile_id?: string | null;
  user_id: string;
  role_id: string | null;
  is_active: boolean | null;
  last_login_at: string | null;
  created_at: string;
  user_phone?: string;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  role_name?: string;
  account_role?: string;
  account_is_active?: boolean;
  active_support_cases?: string;
}

interface StaffDirectorySummary {
  totalProfiles: number;
  activeProfiles: number;
  inactiveProfiles: number;
  activeAccounts: number;
  inactiveAccounts: number;
  activeSupportOwners: number;
  totalAdminAccounts: number;
  unprofiledAdminAccounts: number;
}

interface StaffCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  role: 'admin' | 'super_admin' | 'dpo';
}

type TabId = 'staff' | 'roles' | 'dpo';

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PermissionBadge({ perm }: { perm: string }): React.ReactElement {
  const [scope, action] = perm.split('.');
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
      {scope}.{action}
    </span>
  );
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseTab(value: string | null): TabId {
  return value === 'roles' || value === 'dpo' ? value : 'staff';
}

function formatLastLogin(value: string | null): string {
  if (!value) return 'No recorded login';
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Roles Tab ──────────────────────────────────────────────────────

function RolesTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [formReason, setFormReason] = useState('');
  const [pendingRoleArchive, setPendingRoleArchive] = useState<AdminRole | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
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
    mutationFn: async (params: { name: string; description: string; permissions: string[]; reason: string }) => {
      await api.post('/api/v1/staff/roles', params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminRoles'] }); resetForm(); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...params }: { id: string; name: string; description: string; permissions: string[]; reason: string }) => {
      await api.put(`/api/v1/staff/roles/${id}`, params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminRoles'] }); resetForm(); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.delete(`/api/v1/staff/roles/${id}`, { body: { reason } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminRoles'] });
      setPendingRoleArchive(null);
      setArchiveReason('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  function resetForm(): void {
    setEditing(null);
    setCreating(false);
    setFormName('');
    setFormDesc('');
    setFormPerms([]);
    setFormReason('');
    setError('');
  }

  function startEdit(role: AdminRole): void {
    if (role.name === 'super_admin') return;
    setEditing(role);
    setCreating(false);
    setFormName(role.name);
    setFormDesc(role.description ?? '');
    setFormPerms([...role.permissions]);
    setFormReason('');
    setError('');
  }

  function togglePerm(perm: string): void {
    setFormPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Enter a role name.');
      return;
    }
    if (formPerms.length === 0) {
      setError('Select at least one permission.');
      return;
    }
    if (formReason.trim().length < 10) {
      setError('Enter a reason of at least 10 characters.');
      return;
    }
    const payload = {
      name: formName.trim(),
      description: formDesc.trim(),
      permissions: formPerms,
      reason: formReason.trim(),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const showForm = creating || editing;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Permission labels are not the access-control source yet</p>
        <p className="mt-1 text-amber-900">
          These role profiles are operations metadata. Admin login, pages, and API actions are currently enforced by
          the account role and server route checks. Editing these labels does not grant or revoke access.
        </p>
      </div>
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Roles</h2>
        {!showForm && (
          <button
            type="button"
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg"
            onClick={() => { setCreating(true); setEditing(null); }}
          >
            Create Role
          </button>
        )}
      </div>

      {showForm && (
        <form noValidate onSubmit={handleSubmit} className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="role-name" className="sr-only">Role name</label>
              <input
                id="role-name"
                className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                placeholder="Role name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="role-description" className="sr-only">Role description</label>
              <input
                id="role-description"
                className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                placeholder="Description"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
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
          <div>
            <label htmlFor="role-change-reason" className="text-sm font-medium text-[var(--color-text)]">Reason</label>
            <textarea
              id="role-change-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="Why this operations role profile is being created or changed"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              The reason and full before/after profile are recorded. This profile still does not grant panel access.
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
      {(isRolesError || isPermsError) && <p role="alert" className="text-sm text-red-600">Failed to load roles. Please try again.</p>}

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
                  <button type="button" className="text-sm text-[var(--color-primary)] hover:underline" onClick={() => startEdit(role)}>
                    Edit
                  </button>
                )}
                {getStaffCount(role) === 0 && role.name !== 'super_admin' && (
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => { setPendingRoleArchive(role); setArchiveReason(''); setError(''); }}
                  >
                    Archive
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

      {!showForm && error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {pendingRoleArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="role-archive-title" className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6">
            <h3 id="role-archive-title" className="text-lg font-semibold">Archive role profile</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{formatLabel(pendingRoleArchive.name)}</p>
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              This hides an unused operations profile. It does not revoke any account role or active session.
            </p>
            <label htmlFor="role-archive-reason" className="mt-4 block text-sm font-medium">Reason</label>
            <textarea
              id="role-archive-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Why this role profile is no longer needed"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm" onClick={() => setPendingRoleArchive(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const reason = archiveReason.trim();
                  if (reason.length < 10) {
                    setError('Enter an archive reason of at least 10 characters.');
                    return;
                  }
                  deleteMutation.mutate({ id: pendingRoleArchive.id, reason });
                }}
              >
                {deleteMutation.isPending ? 'Archiving...' : 'Archive profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Staff Tab ──────────────────────────────────────────────────────

function StaffTab({ page, onPageChange }: { page: number; onPageChange: (page: number) => void }): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFilter = (searchParams.get('search') ?? '').trim();
  const profileStatusFilter = searchParams.get('profileStatus') ?? '';
  const accountStatusFilter = searchParams.get('accountStatus') ?? '';
  const accountRoleFilter = searchParams.get('accountRole') ?? '';
  const roleProfileFilter = searchParams.get('roleId') ?? '';
  const [searchDraft, setSearchDraft] = useState(searchFilter);
  const [showAdd, setShowAdd] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [addRoleId, setAddRoleId] = useState('');
  const [addReason, setAddReason] = useState('');
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
  const [roleChangeReason, setRoleChangeReason] = useState('');
  const [pendingProfileAction, setPendingProfileAction] = useState<{
    staff: AdminStaff;
    kind: 'activate' | 'deactivate' | 'archive';
  } | null>(null);
  const [profileActionReason, setProfileActionReason] = useState('');
  const limit = adminConfig.defaultPageSize;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminStaff', page, searchFilter, profileStatusFilter, accountStatusFilter, accountRoleFilter, roleProfileFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (searchFilter.length >= 2) params.set('search', searchFilter);
      if (profileStatusFilter === 'active' || profileStatusFilter === 'inactive') {
        params.set('profileActive', profileStatusFilter === 'active' ? 'true' : 'false');
      }
      if (profileStatusFilter === 'missing') params.set('profileMissing', 'true');
      if (accountStatusFilter === 'active' || accountStatusFilter === 'inactive') {
        params.set('accountActive', accountStatusFilter === 'active' ? 'true' : 'false');
      }
      if (['admin', 'super_admin', 'dpo'].includes(accountRoleFilter)) params.set('accountRole', accountRoleFilter);
      if (roleProfileFilter) params.set('roleId', roleProfileFilter);
      const res = await api.get(`/api/v1/staff?${params}`);
      return res.data as {
        data: AdminStaff[];
        meta: { total: number; summary?: StaffDirectorySummary };
      };
    },
  });

  const { data: roles, isError: isRolesError } = useQuery({
    queryKey: ['adminRoles'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/roles');
      return res.data.data as AdminRole[];
    },
  });

  const candidateQuery = useQuery({
    queryKey: ['adminStaffCandidates', candidateSearch.trim()],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/candidates', {
        params: { search: candidateSearch.trim(), limit: 20 },
      });
      return res.data.data as StaffCandidate[];
    },
    enabled: showAdd && candidateSearch.trim().length >= 2,
  });

  const addMutation = useMutation({
    mutationFn: async (params: { userId: string; roleId: string; reason: string }) => {
      await api.post('/api/v1/staff', params);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      setShowAdd(false);
      setCandidateSearch('');
      setSelectedCandidateId('');
      setAddRoleId('');
      setAddReason('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...params }: { id: string; roleId?: string; isActive?: boolean; reason: string }) => {
      await api.put(`/api/v1/staff/${id}`, params);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminStaff'] }); setError(''); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.delete(`/api/v1/staff/${id}`, { body: { reason } });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['adminStaff'] }); setError(''); },
    onError: (e) => setError(getErrorMessage(e)),
  });

  function handleAddStaff(e: FormEvent): void {
    e.preventDefault();
    const userId = selectedCandidateId;
    const roleId = addRoleId.trim();
    if (!userId) {
      setError('Select an active admin-tier account.');
      return;
    }
    if (!roleId) {
      setError('Select a role.');
      return;
    }
    if (addReason.trim().length < 10) {
      setError('Enter a reason of at least 10 characters.');
      return;
    }
    addMutation.mutate({ userId, roleId, reason: addReason.trim() });
  }

  function setDirectoryFilter(key: 'profileStatus' | 'accountStatus' | 'accountRole' | 'roleId', value: string): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (value) params.set(key, value);
      else params.delete(key);
      return params;
    });
  }

  function staffName(staff: AdminStaff): string {
    return [staff.user_first_name, staff.user_last_name].filter(Boolean).join(' ')
      || staff.user_email
      || staff.user_phone
      || 'Unnamed staff account';
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">Staff directory profiles</p>
        <p className="mt-1 text-blue-900">
          This directory can only attach active admin, super-admin, or DPO accounts. Account roles and server RBAC
          remain the access source. Directory profiles organize operational ownership but do not grant panel access.
        </p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Account lifecycle is not controlled here</p>
        <p className="mt-1 text-amber-900">
          Adding, deactivating, or archiving a directory profile does not create or deactivate a login account and
          does not revoke active sessions. Governed account provisioning, deactivation, and session revocation remain
          an open launch limitation. Do not treat a profile change as an access-control action.
        </p>
      </div>

      <section aria-label="Staff directory summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Directory profiles', data?.meta?.summary?.totalProfiles ?? data?.meta?.total ?? 0],
          ['Active profiles', data?.meta?.summary?.activeProfiles ?? 0],
          ['Admin-tier accounts', data?.meta?.summary?.totalAdminAccounts ?? 0],
          ['Accounts missing profiles', data?.meta?.summary?.unprofiledAdminAccounts ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{value}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Staff operations directory</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Review account truth, directory metadata, workload, and audit history together.</p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Close form' : 'Add directory profile'}
        </button>
      </div>

      <form
        role="search"
        className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 md:grid-cols-2 xl:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchParams((current) => {
            const params = new URLSearchParams(current);
            params.delete('page');
            const value = searchDraft.trim();
            if (value.length >= 2) params.set('search', value);
            else params.delete('search');
            return params;
          });
        }}
      >
        <div className="md:col-span-2 xl:col-span-1">
          <label htmlFor="staff-directory-search" className="text-xs font-medium text-[var(--color-text-secondary)]">Search staff accounts</label>
          <div className="mt-1 flex gap-2">
            <input
              id="staff-directory-search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Name, email, or phone"
              className="h-11 min-w-0 flex-1 rounded border border-[var(--color-border)] px-3 text-sm"
            />
            <button type="submit" className="h-11 rounded bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Search</button>
          </div>
        </div>
        <div>
          <label htmlFor="staff-account-status" className="text-xs font-medium text-[var(--color-text-secondary)]">Login account status</label>
          <select id="staff-account-status" value={accountStatusFilter} onChange={(event) => setDirectoryFilter('accountStatus', event.target.value)} className="mt-1 h-11 w-full rounded border border-[var(--color-border)] bg-white px-3 text-sm">
            <option value="">All account statuses</option>
            <option value="active">Active accounts</option>
            <option value="inactive">Inactive accounts</option>
          </select>
        </div>
        <div>
          <label htmlFor="staff-account-role" className="text-xs font-medium text-[var(--color-text-secondary)]">Login account role</label>
          <select id="staff-account-role" value={accountRoleFilter} onChange={(event) => setDirectoryFilter('accountRole', event.target.value)} className="mt-1 h-11 w-full rounded border border-[var(--color-border)] bg-white px-3 text-sm">
            <option value="">All account roles</option>
            <option value="super_admin">Super admin</option>
            <option value="admin">Admin</option>
            <option value="dpo">DPO</option>
          </select>
        </div>
        <div>
          <label htmlFor="staff-profile-status" className="text-xs font-medium text-[var(--color-text-secondary)]">Directory status</label>
          <select id="staff-profile-status" value={profileStatusFilter} onChange={(event) => setDirectoryFilter('profileStatus', event.target.value)} className="mt-1 h-11 w-full rounded border border-[var(--color-border)] bg-white px-3 text-sm">
            <option value="">All profile statuses</option>
            <option value="active">Active profiles</option>
            <option value="inactive">Inactive profiles</option>
            <option value="missing">No directory profile</option>
          </select>
        </div>
        <div>
          <label htmlFor="staff-role-profile-filter" className="text-xs font-medium text-[var(--color-text-secondary)]">Directory role profile</label>
          <select id="staff-role-profile-filter" value={roleProfileFilter} onChange={(event) => setDirectoryFilter('roleId', event.target.value)} className="mt-1 h-11 w-full rounded border border-[var(--color-border)] bg-white px-3 text-sm">
            <option value="">All role profiles</option>
            {(roles ?? []).map((role) => <option key={role.id} value={role.id}>{formatLabel(role.name)}</option>)}
          </select>
        </div>
      </form>

      {showAdd && (
        <form
          noValidate
          className="bg-white border border-[var(--color-border)] rounded-lg p-4 grid gap-3 md:grid-cols-2"
          onSubmit={handleAddStaff}
        >
          <div>
            <label htmlFor="staff-candidate-search" className="text-xs text-[var(--color-text-secondary)]">Find admin-tier account</label>
            <input
              id="staff-candidate-search"
              className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm mt-1"
              placeholder="Search name, email, or phone"
              value={candidateSearch}
              onChange={(e) => {
                setCandidateSearch(e.target.value);
                setSelectedCandidateId('');
              }}
            />
            {candidateSearch.trim().length >= 2 && (
              <select
                aria-label="Matching admin-tier account"
                className="mt-2 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
              >
                <option value="">Select matching account</option>
                {(candidateQuery.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {[candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || candidate.email || candidate.phone}
                    {' '}({formatLabel(candidate.role)})
                  </option>
                ))}
              </select>
            )}
            {candidateQuery.isError && <p role="alert" className="mt-1 text-xs text-red-600">Could not search admin-tier accounts.</p>}
          </div>
          <div>
            <label htmlFor="staff-role-id" className="text-xs text-[var(--color-text-secondary)]">Directory role profile</label>
            <select
              id="staff-role-id"
              className="w-full border border-[var(--color-border)] rounded px-3 py-2 text-sm mt-1"
              value={addRoleId}
              onChange={(e) => setAddRoleId(e.target.value)}
            >
              <option value="">Select role</option>
              {(roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>{formatLabel(role.name)}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="staff-add-reason" className="text-xs text-[var(--color-text-secondary)]">Reason</label>
            <textarea
              id="staff-add-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              placeholder="Why this operations-directory profile is needed"
            />
          </div>
          <button type="submit" className="w-fit px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg">
            Add
          </button>
        </form>
      )}

      {isError && <p role="alert" className="text-sm text-red-600">Failed to load staff members. Please try again.</p>}
      {isRolesError && <p role="alert" className="text-sm text-red-600">Failed to load roles for assignment. Please refresh.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {isLoading && <p className="rounded-lg border border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-text-secondary)]">Loading staff directory...</p>}
      {!isLoading && !isError && (data?.data.length ?? 0) === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-text-secondary)]">
          No staff accounts or directory profiles match these filters.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {(data?.data ?? []).map((staff) => {
          const activeCases = Number(staff.active_support_cases ?? 0);
          const accountActive = staff.account_is_active === true;
          const profileId = staff.profile_id ?? (staff.role_id ? staff.id : null);
          const profileRoleId = staff.role_id;
          return (
            <article key={staff.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-[var(--color-text)]">{staffName(staff)}</h3>
                  <p className="truncate text-sm text-[var(--color-text-secondary)]">{staff.user_email ?? 'No email recorded'}</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{staff.user_phone ?? 'No phone recorded'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={accountActive ? 'success' : 'danger'} label={`Account ${accountActive ? 'active' : 'inactive'}`} />
                  <Badge variant="info" label={formatLabel(staff.account_role ?? 'unknown account role')} />
                </div>
              </div>

              {!accountActive && (
                <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  This login account is inactive. Its directory profile may still be visible for ownership history.
                </p>
              )}

              <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Login account</p>
                  <dl className="mt-2 space-y-2 text-sm">
                    <div><dt className="text-[var(--color-text-secondary)]">Actual access role</dt><dd className="font-medium">{formatLabel(staff.account_role ?? 'Unknown')}</dd></div>
                    <div><dt className="text-[var(--color-text-secondary)]">Last login</dt><dd className="font-medium">{formatLastLogin(staff.last_login_at)}</dd></div>
                    <div><dt className="text-[var(--color-text-secondary)]">Active support cases</dt><dd className="font-medium">{activeCases}</dd></div>
                  </dl>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Operations directory</p>
                  {profileId && profileRoleId ? (
                    <>
                      <label htmlFor={`staff-profile-${profileId}`} className="mt-2 block text-xs text-[var(--color-text-secondary)]">Role profile metadata</label>
                      <select
                        id={`staff-profile-${profileId}`}
                        aria-label={`Change directory profile for ${staffName(staff)}`}
                        className="mt-1 h-11 w-full rounded border border-[var(--color-border)] bg-white px-3 text-sm"
                        value={profileRoleId}
                        onChange={(event) => {
                          const newRoleId = event.target.value;
                          if (newRoleId === profileRoleId) return;
                          const newRoleName = (roles ?? []).find((role) => role.id === newRoleId)?.name ?? '(unknown)';
                          setPendingRoleChange({ staff: { ...staff, id: profileId }, newRoleId, newRoleName });
                          setRoleChangeReason('');
                          event.target.value = profileRoleId;
                        }}
                      >
                        {(roles ?? []).map((role) => <option key={role.id} value={role.id}>{formatLabel(role.name)}</option>)}
                      </select>
                      <div className="mt-3 flex items-center gap-2">
                        <Badge variant={staff.is_active ? 'success' : 'outline'} label={`Profile ${staff.is_active ? 'active' : 'inactive'}`} />
                        <span className="text-xs text-[var(--color-text-secondary)]">{formatLabel(staff.role_name ?? 'Unassigned')}</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-semibold">No directory profile</p>
                      <p className="mt-1 text-xs">This account can still own support cases when its account role is Admin or Super Admin.</p>
                      <button
                        type="button"
                        className="mt-3 font-semibold text-[var(--color-primary)] hover:underline"
                        onClick={() => {
                          setShowAdd(true);
                          setCandidateSearch(staffName(staff));
                          setSelectedCandidateId(staff.user_id);
                          setAddRoleId('');
                          setAddReason('');
                        }}
                      >
                        Prepare directory profile
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3 border-t border-[var(--color-border)] pt-4 text-sm">
                <Link className="font-semibold text-[var(--color-primary)] hover:underline" to={`/support-tickets?assignedAgentId=${encodeURIComponent(staff.user_id)}&active=1&agentName=${encodeURIComponent(staffName(staff))}`}>
                  Open active cases ({activeCases})
                </Link>
                {profileId && (
                  <Link className="font-semibold text-[var(--color-primary)] hover:underline" to={`/audit-log?entityType=admin_staff&entityId=${encodeURIComponent(profileId)}`}>Profile audit</Link>
                )}
                <Link className="font-semibold text-[var(--color-primary)] hover:underline" to={`/audit-log?userId=${encodeURIComponent(staff.user_id)}`}>Actions by staff</Link>
                {profileId && (
                  <>
                    <button
                      type="button"
                      className="font-semibold text-[var(--color-primary)] hover:underline"
                      onClick={() => {
                        setPendingProfileAction({ staff: { ...staff, id: profileId }, kind: staff.is_active ? 'deactivate' : 'activate' });
                        setProfileActionReason('');
                      }}
                    >
                      {staff.is_active ? 'Deactivate profile' : 'Activate profile'}
                    </button>
                    <button
                      type="button"
                      className="font-semibold text-red-700 hover:underline"
                      onClick={() => {
                        setPendingProfileAction({ staff: { ...staff, id: profileId }, kind: 'archive' });
                        setProfileActionReason('');
                      }}
                    >
                      Archive profile
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {data && (
        <Pagination
          page={page}
          totalPages={Math.ceil((data.meta?.total ?? 0) / limit)}
          total={data.meta?.total ?? 0}
          pageSize={limit}
          onPageChange={onPageChange}
        />
      )}

      {pendingRoleChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="staff-role-change-title" className="bg-white rounded-xl border border-[var(--color-border)] w-full max-w-md p-6">
            <h3 id="staff-role-change-title" className="text-lg font-semibold text-[var(--color-text)] mb-1">
              Change directory role profile
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
                This changes directory metadata only. Account access remains controlled by the account role and
                server checks. The reason and before/after profile values are recorded in the audit log.
              </p>
            </div>
            <label htmlFor="staff-role-change-reason" className="text-sm font-medium text-[var(--color-text)]">Reason</label>
            <textarea
              id="staff-role-change-reason"
              className="mt-1 mb-4 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={roleChangeReason}
              onChange={(e) => setRoleChangeReason(e.target.value)}
              placeholder="Why this directory role profile is changing"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingRoleChange(null)}
                className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (roleChangeReason.trim().length < 10) {
                    setError('Enter a role-change reason of at least 10 characters.');
                    return;
                  }
                  updateMutation.mutate({
                    id: pendingRoleChange.staff.id,
                    roleId: pendingRoleChange.newRoleId,
                    reason: roleChangeReason.trim(),
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

      {pendingProfileAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="staff-profile-action-title" className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6">
            <h3 id="staff-profile-action-title" className="text-lg font-semibold text-[var(--color-text)]">
              {pendingProfileAction.kind === 'archive' ? 'Archive directory profile' : `${formatLabel(pendingProfileAction.kind)} directory profile`}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {[pendingProfileAction.staff.user_first_name, pendingProfileAction.staff.user_last_name].filter(Boolean).join(' ') || pendingProfileAction.staff.user_email || 'Staff profile'}
            </p>
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              This changes the operations directory record. It does not change the account role or revoke an active login session.
            </p>
            <label htmlFor="staff-profile-action-reason" className="mt-4 block text-sm font-medium">Reason</label>
            <textarea
              id="staff-profile-action-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={profileActionReason}
              onChange={(e) => setProfileActionReason(e.target.value)}
              placeholder="Reason recorded in the audit log"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm" onClick={() => setPendingProfileAction(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={updateMutation.isPending || removeMutation.isPending}
                onClick={() => {
                  const reason = profileActionReason.trim();
                  if (reason.length < 10) {
                    setError('Enter an action reason of at least 10 characters.');
                    return;
                  }
                  if (pendingProfileAction.kind === 'archive') {
                    removeMutation.mutate({ id: pendingProfileAction.staff.id, reason });
                  } else {
                    updateMutation.mutate({
                      id: pendingProfileAction.staff.id,
                      isActive: pendingProfileAction.kind === 'activate',
                      reason,
                    });
                  }
                  setPendingProfileAction(null);
                }}
              >
                Confirm {pendingProfileAction.kind}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DPO Management Tab ────────────────────────────────────────────

interface DpoUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  promotedAt: string | null;
}

function DpoTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [promoteReason, setPromoteReason] = useState('');
  const [pendingDemotion, setPendingDemotion] = useState<DpoUser | null>(null);
  const [demoteReason, setDemoteReason] = useState('');
  const [error, setError] = useState('');

  const dpoQuery = useQuery({
    queryKey: ['adminDpos'],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/dpos');
      return res.data.data as DpoUser[];
    },
  });

  const candidateQuery = useQuery({
    queryKey: ['dpoCandidates', candidateSearch.trim()],
    queryFn: async () => {
      const res = await api.get('/api/v1/staff/dpo-candidates', {
        params: { search: candidateSearch.trim(), limit: 20 },
      });
      return res.data.data as StaffCandidate[];
    },
    enabled: (dpoQuery.data?.length ?? 0) === 0 && candidateSearch.trim().length >= 2,
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      await api.post(`/api/v1/staff/dpos/${userId}/promote`, { reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminDpos'] });
      setCandidateSearch('');
      setSelectedCandidateId('');
      setPromoteReason('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const demoteMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      await api.post(`/api/v1/staff/dpos/${userId}/demote`, { reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminDpos'] });
      setPendingDemotion(null);
      setDemoteReason('');
      setError('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const dpos = dpoQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <p className="font-semibold">Data Protection Officer seat</p>
        <p className="mt-1 text-violet-900">
          This is an actual account-role change, not a directory label. It grants the privacy routes defined for the
          DPO and removes the account&apos;s previous role. Only one active DPO may be assigned; every handover is audited.
        </p>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Immediate privacy access boundary</p>
        <p className="mt-1 text-emerald-900">
          Assignment and handover invalidate the account&apos;s old access, refresh, CSRF, and live socket sessions.
          The affected person must sign in again and receives only the routes allowed by the new account role.
        </p>
      </div>

      {dpoQuery.isLoading && <p className="text-sm text-[var(--color-text-secondary)]">Loading DPO assignment...</p>}
      {dpoQuery.isError && <p role="alert" className="text-sm text-red-600">Failed to load the DPO assignment.</p>}
      {dpos.length > 1 && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          More than one active DPO exists. Do not assign another; complete a controlled handover and review the audit log.
        </p>
      )}

      {dpos.length === 0 && !dpoQuery.isLoading && !dpoQuery.isError && (
        <form
          noValidate
          className="rounded-lg border border-[var(--color-border)] bg-white p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selectedCandidateId) {
              setError('Select an active admin account.');
              return;
            }
            if (promoteReason.trim().length < 10) {
              setError('Enter an assignment reason of at least 10 characters.');
              return;
            }
            promoteMutation.mutate({ userId: selectedCandidateId, reason: promoteReason.trim() });
          }}
        >
          <div>
            <h2 className="font-semibold">DPO seat vacant</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Assign an existing active admin account after the appointment and registration steps are approved.</p>
          </div>
          <div>
            <label htmlFor="dpo-candidate-search" className="text-sm font-medium">Find active admin account</label>
            <input
              id="dpo-candidate-search"
              className="mt-1 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={candidateSearch}
              onChange={(e) => { setCandidateSearch(e.target.value); setSelectedCandidateId(''); }}
              placeholder="Search name, email, or phone"
            />
          </div>
          {candidateSearch.trim().length >= 2 && (
            <select
              aria-label="Matching DPO candidate"
              className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
            >
              <option value="">Select active admin</option>
              {(candidateQuery.data ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {[candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || candidate.email || candidate.phone}
                </option>
              ))}
            </select>
          )}
          {candidateQuery.isError && <p role="alert" className="text-sm text-red-600">Could not search DPO candidates.</p>}
          <div>
            <label htmlFor="dpo-promote-reason" className="text-sm font-medium">Assignment reason</label>
            <textarea
              id="dpo-promote-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={promoteReason}
              onChange={(e) => setPromoteReason(e.target.value)}
              placeholder="Appointment authority and handover context"
            />
          </div>
          <button type="submit" disabled={promoteMutation.isPending} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-white disabled:opacity-50">
            {promoteMutation.isPending ? 'Assigning...' : 'Assign DPO'}
          </button>
        </form>
      )}

      {dpos.map((dpo) => (
        <div key={dpo.id} className="rounded-lg border border-[var(--color-border)] bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="font-semibold">{[dpo.firstName, dpo.lastName].filter(Boolean).join(' ') || 'Assigned DPO'}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">{dpo.email ?? 'No email recorded'}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Assigned {dpo.promotedAt ? new Date(dpo.promotedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'before recorded promotion timestamps'}
            </p>
          </div>
          <button
            type="button"
            className="mt-3 text-sm text-red-700 hover:underline sm:mt-0"
            onClick={() => { setPendingDemotion(dpo); setDemoteReason(''); setError(''); }}
          >
            Start handover
          </button>
        </div>
      ))}

      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {pendingDemotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="dpo-handover-title" className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-white p-6">
            <h3 id="dpo-handover-title" className="text-lg font-semibold">Remove current DPO role</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {[pendingDemotion.firstName, pendingDemotion.lastName].filter(Boolean).join(' ') || pendingDemotion.email}
            </p>
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              This returns the dedicated account to the Admin role, immediately revokes every old session, and leaves
              the DPO seat vacant until a replacement is assigned. Complete the documented records handover and NPC
              update outside the app as required.
            </p>
            <p className="mt-4 text-sm"><span className="font-medium">Account role after removal:</span> Admin</p>
            <label htmlFor="dpo-demote-reason" className="mt-4 block text-sm font-medium">Handover reason</label>
            <textarea
              id="dpo-demote-reason"
              className="mt-1 min-h-20 w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              value={demoteReason}
              onChange={(e) => setDemoteReason(e.target.value)}
              placeholder="Appointment end, destination role, and replacement plan"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm" onClick={() => setPendingDemotion(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={demoteMutation.isPending}
                onClick={() => {
                  const reason = demoteReason.trim();
                  if (reason.length < 10) {
                    setError('Enter a handover reason of at least 10 characters.');
                    return;
                  }
                  demoteMutation.mutate({ userId: pendingDemotion.id, reason });
                }}
              >
                {demoteMutation.isPending ? 'Removing...' : 'Confirm handover'}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const page = parsePage(searchParams.get('page'));
  // Phase 200 fix — every staff/roles endpoint is gated super_admin on the
  // server (staff.routes.ts rbacMiddleware('super_admin')). Pre-fix a plain
  // admin saw a fully interactive UI where every action 403'd. Show a clear
  // access notice instead of a trap.
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');

  function selectTab(nextTab: TabId): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('page');
      if (nextTab === 'staff') params.delete('tab');
      else params.set('tab', nextTab);
      return params;
    });
  }

  function setStaffPage(nextPage: number): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('tab');
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    });
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Staff & Roles</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-amber-800">Super-admin access required</p>
          <p className="mt-1 text-sm text-amber-700">
            Managing staff members, roles, and permissions is restricted to super-admin accounts. Contact a
            super-admin if you need changes made here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Staff & Roles</h1>

      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {([['staff', 'Staff'], ['roles', 'Role Profiles'], ['dpo', 'DPO Management']] as [TabId, string][]).map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => selectTab(id)}
            className={`min-h-11 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab page={page} onPageChange={setStaffPage} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'dpo' && <DpoTab />}
    </div>
  );
}
