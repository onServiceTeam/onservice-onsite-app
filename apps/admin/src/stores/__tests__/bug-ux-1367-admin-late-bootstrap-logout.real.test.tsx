import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('@/stores/auth.store');
import api from '@/lib/api';
import { useAuthStore, type AdminUser } from '../auth.store';

function SessionControls(): React.ReactElement {
  const state = useAuthStore();
  return <>
    <output aria-label="Current operator">{state.user?.email ?? 'Signed out'}</output>
    <button onClick={() => { void state.hydrate(); }}>Check session</button>
    <button onClick={() => { void state.logout(); }}>Sign out</button>
  </>;
}

it('Bug UX-1367 — a startup session response arriving after logout cannot restore the signed-out operator', async () => {
  const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    firstName: 'Synthetic', lastName: 'Supervisor', email: 'old@example.invalid', phone: '', avatarUrl: null };
  let finish!: () => void;
  const barrier = new Promise<void>(resolve => { finish = resolve; });
  vi.mocked(api.get).mockReset().mockImplementation(async () => {
    await barrier;
    return { data: { success: true, data: { ...actor, mustRotatePassword: true } }, status: 200, ok: true };
  });
  vi.mocked(api.post).mockReset().mockImplementation(async () => {
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    return { data: { success: true, data: {} }, status: 200, ok: true };
  });
  useAuthStore.setState({ user: actor, isAuthenticated: true, isLoading: false, mustRotatePassword: false });
  document.cookie = 'admin_csrf=synthetic-old-session; Path=/';
  const view = render(<SessionControls />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Check session' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Current operator')).toHaveTextContent('Signed out'));
    await act(async () => { finish(); await barrier; });
    expect(screen.getByLabelText('Current operator')).toHaveTextContent('Signed out');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().mustRotatePassword).toBe(false);
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/admin/logout');
  } finally {
    await act(async () => { finish(); await barrier; });
    view.unmount();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  }
});
