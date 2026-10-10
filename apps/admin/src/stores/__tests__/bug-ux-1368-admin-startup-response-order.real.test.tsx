import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('@/stores/auth.store');
import api from '@/lib/api';
import { useAuthStore } from '../auth.store';

function StartupControls(): React.ReactElement {
  const state = useAuthStore();
  return <>
    <output aria-label="Current role">{state.user?.role ?? 'Signed out'}</output>
    <output aria-label="Password change">{state.mustRotatePassword ? 'Required' : 'Not required'}</output>
    <button onClick={() => { void state.hydrate(); }}>Check current session</button>
  </>;
}

it('Bug UX-1368 — an older overlapping startup response cannot replace the newest role and password-rotation requirement', async () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
  for (const outcome of ['success', 'failure'] as const) {
    let finish!: () => void;
    const barrier = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(api.get).mockReset()
      .mockImplementationOnce(async () => {
        await barrier;
        if (outcome === 'failure') throw new Error('Synthetic obsolete session failure');
        return { data: { success: true, data: { ...actor, mustRotatePassword: false } }, status: 200, ok: true };
      })
      .mockResolvedValueOnce({ data: { success: true, data: { ...actor, role: 'admin', mustRotatePassword: true } }, status: 200, ok: true });
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=synthetic-current-session; Path=/';
    const view = render(<StartupControls />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Check current session' }));
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Check current session' }));
      await waitFor(() => expect(screen.getByLabelText('Current role')).toHaveTextContent(/^admin$/));
      expect(screen.getByLabelText('Password change')).toHaveTextContent(/^Required$/);
      await act(async () => { finish(); await barrier; });
      expect(screen.getByLabelText('Current role')).toHaveTextContent(/^admin$/);
      expect(screen.getByLabelText('Password change')).toHaveTextContent(/^Required$/);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => { finish(); await barrier; });
      view.unmount();
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    }
  }
});
