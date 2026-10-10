import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('@/stores/auth.store');
import api from '@/lib/api';
import { useAuthStore, type AdminUser } from '../auth.store';

const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'dpo',
  firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };

function Controls(): React.ReactElement {
  const state = useAuthStore();
  return <>
    <output aria-label="Session">{state.isLoading ? 'Loading' : state.user?.role ?? 'Signed out'}</output>
    <output aria-label="Rotation">{state.mustRotatePassword ? 'Required' : 'Not required'}</output>
    <button onClick={() => { void state.hydrate(); }}>Read session</button>
    <button onClick={() => { state.login(actor, { mustRotatePassword: true }); }}>Accept completed login</button>
    <button onClick={() => { void state.logout(); }}>Sign out</button>
  </>;
}

function reset(): void {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
}

it('a current DPO startup check still accepts its role and required rotation', async () => {
  reset();
  document.cookie = 'admin_csrf=synthetic-session; Path=/';
  vi.mocked(api.get).mockReset().mockResolvedValue({ data: { success: true, data: { ...actor, mustRotatePassword: true } }, status: 200, ok: true });
  const view = render(<Controls />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read session' }));
    await waitFor(() => expect(screen.getByLabelText('Session')).toHaveTextContent(/^dpo$/));
    expect(screen.getByLabelText('Rotation')).toHaveTextContent(/^Required$/);
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/me');
  } finally { view.unmount(); reset(); }
});

it('the latest failed or non-admin startup check still settles signed out', async () => {
  for (const outcome of ['failure', 'customer'] as const) {
    reset();
    document.cookie = 'admin_csrf=synthetic-session; Path=/';
    vi.mocked(api.get).mockReset().mockImplementation(async () => {
      if (outcome === 'failure') throw new Error('Synthetic rejected current session');
      return { data: { success: true, data: { ...actor, role: 'customer', mustRotatePassword: true } }, status: 200, ok: true };
    });
    const view = render(<Controls />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Read session' }));
      await waitFor(() => expect(screen.getByLabelText('Session')).toHaveTextContent('Signed out'));
      expect(screen.getByLabelText('Rotation')).toHaveTextContent('Not required');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    } finally { view.unmount(); reset(); }
  }
});

it('a completed login clears bootstrap loading without waiting for the old request', async () => {
  reset();
  document.cookie = 'admin_csrf=synthetic-session; Path=/';
  let finish!: () => void;
  const barrier = new Promise<void>(resolve => { finish = resolve; });
  vi.mocked(api.get).mockReset().mockImplementation(async () => {
    await barrier;
    return { data: { success: true, data: { ...actor, role: 'super_admin', mustRotatePassword: false } }, status: 200, ok: true };
  });
  const view = render(<Controls />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read session' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Accept completed login' }));
    expect(screen.getByLabelText('Session')).toHaveTextContent(/^dpo$/);
    expect(screen.getByLabelText('Rotation')).toHaveTextContent(/^Required$/);
    await act(async () => { finish(); await barrier; });
    expect(screen.getByLabelText('Session')).toHaveTextContent(/^dpo$/);
    expect(screen.getByLabelText('Rotation')).toHaveTextContent(/^Required$/);
  } finally { await act(async () => { finish(); await barrier; }); view.unmount(); reset(); }
});

it('a startup read begun during a failed logout cannot restore local identity after logout settles', async () => {
  reset();
  document.cookie = 'admin_csrf=synthetic-session; Path=/';
  useAuthStore.setState({ user: actor, isAuthenticated: true, isLoading: false });
  let finishRead!: () => void;
  let finishLogout!: () => void;
  const readBarrier = new Promise<void>(resolve => { finishRead = resolve; });
  const logoutBarrier = new Promise<void>(resolve => { finishLogout = resolve; });
  vi.mocked(api.get).mockReset().mockImplementation(async () => {
    await readBarrier;
    return { data: { success: true, data: actor }, status: 200, ok: true };
  });
  vi.mocked(api.post).mockReset().mockImplementation(async () => {
    await logoutBarrier;
    throw new Error('Synthetic logout network failure');
  });
  const view = render(<Controls />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Read session' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await act(async () => { finishLogout(); await logoutBarrier; });
    expect(screen.getByLabelText('Session')).toHaveTextContent('Signed out');
    await act(async () => { finishRead(); await readBarrier; });
    expect(screen.getByLabelText('Session')).toHaveTextContent('Signed out');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    // Local settlement is not a claim that the server revoked a failed logout.
    expect(document.cookie).toContain('admin_csrf=synthetic-session');
  } finally {
    await act(async () => { finishLogout(); finishRead(); await Promise.all([logoutBarrier, readBarrier]); });
    view.unmount(); reset();
  }
});
