import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.unmock('react-router-dom');
vi.unmock('@/stores/auth.store');
const calls = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: calls, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/pages/DashboardPage', () => ({ default: () => <h1>Operator workspace</h1> }));
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('Bug UX-1366 — a late startup session check cannot replace a newer login or its password-rotation requirement', async () => {
  const oldActor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    firstName: 'Old', lastName: 'Supervisor', email: 'old@example.invalid', phone: '', avatarUrl: null };
  const newActor: AdminUser = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'admin', firstName: 'New', lastName: 'Operator', email: 'new@example.invalid' };

  for (const outcome of ['success', 'failure'] as const) {
    let finish!: () => void;
    const barrier = new Promise<void>(resolve => { finish = resolve; });
    calls.get.mockReset().mockImplementation(async (url: string) => {
      if (url !== '/api/v1/auth/me') throw new Error(`Unexpected GET: ${url}`);
      await barrier;
      if (outcome === 'failure') throw new Error('Synthetic expired old session');
      return { data: { success: true, data: { ...oldActor, mustRotatePassword: true } } };
    });
    calls.post.mockReset().mockImplementation(async (url: string, body: unknown) => {
      expect(url).toBe('/api/v1/auth/admin/login');
      expect(body).toEqual({ email: newActor.email, password: 'synthetic-test-only-not-a-credential' });
      document.cookie = 'admin_csrf=synthetic-new-session; Path=/';
      return { data: { success: true, data: { user: newActor, mustRotatePassword: false } } };
    });
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=synthetic-old-session; Path=/';
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/login'] });
    const view = render(<RouterProvider router={router} />);
    try {
      await waitFor(() => expect(calls.get).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: newActor.email } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-test-only-not-a-credential' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      await waitFor(() => expect(useAuthStore.getState().user?.id).toBe(newActor.id));
      await act(async () => { finish(); await barrier; });
      expect(useAuthStore.getState().user?.id).toBe(newActor.id);
      expect(useAuthStore.getState().mustRotatePassword).toBe(false);
      expect(await screen.findByRole('heading', { name: 'Operator workspace' })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
      expect(screen.getByText('new@example.invalid')).toBeVisible();
      expect(screen.queryByText('old@example.invalid')).toBeNull();
      expect(calls.get).toHaveBeenCalledTimes(1);
      expect(calls.post).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => { finish(); await barrier; });
      view.unmount(); router.dispose();
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    }
  }
});
