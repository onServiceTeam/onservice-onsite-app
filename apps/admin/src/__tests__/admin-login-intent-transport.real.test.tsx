import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
vi.mock('@/pages/DashboardPage', () => ({ default: () => <h1>Current operator workspace</h1> }));
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('an old bootstrap completing during a newer real login cannot reset its form or cancel its success/failure settlement', async () => {
  const previousFetch = globalThis.fetch;
  const oldActor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    firstName: 'Old', lastName: 'Supervisor', email: 'old@example.invalid', phone: '', avatarUrl: null };
  const newActor: AdminUser = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'admin', firstName: 'New', email: 'new@example.invalid' };
  for (const outcome of ['success', 'failure'] as const) {
    let finishStartup!: () => void;
    let finishLogin!: () => void;
    const startup = new Promise<void>(resolve => { finishStartup = resolve; });
    const login = new Promise<void>(resolve => { finishLogin = resolve; });
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input); requests.push(url);
      let status = 200;
      let body: unknown;
      if (url === '/api/v1/auth/me') {
        await startup;
        body = { success: true, data: { ...oldActor, mustRotatePassword: true } };
      } else if (url === '/api/v1/auth/admin/login') {
        await login;
        if (outcome === 'success') {
          document.cookie = 'admin_csrf=synthetic-new-login; Path=/';
          body = { success: true, data: { user: newActor, mustRotatePassword: false } };
        } else {
          status = 401;
          body = { success: false, error: { message: 'Synthetic invalid password' } };
        }
      } else throw new Error(`Unexpected synthetic fetch: ${url}`);
      return { ok: status === 200, status, text: async () => JSON.stringify(body) } as Response;
    }) as typeof fetch;
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=synthetic-old-login; Path=/';
    const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/login'] });
    const view = render(<RouterProvider router={router} />);
    try {
      await waitFor(() => expect(requests).toEqual(['/api/v1/auth/me']));
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: newActor.email } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-test-only-not-a-credential' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
      await waitFor(() => expect(requests).toHaveLength(2));
      await act(async () => { finishStartup(); await startup; });
      expect(screen.getByLabelText('Email')).toHaveValue(newActor.email);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
      await act(async () => { finishLogin(); await login; });
      if (outcome === 'success') {
        expect(await screen.findByRole('heading', { name: 'Current operator workspace' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
        expect(screen.getByText('new@example.invalid')).toBeVisible();
        expect(useAuthStore.getState().mustRotatePassword).toBe(false);
      } else {
        expect(await screen.findByText('Synthetic invalid password')).toBeVisible();
        expect(screen.getByLabelText('Email')).toHaveValue(newActor.email);
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
        expect(useAuthStore.getState().isLoading).toBe(false);
      }
      expect(requests).toEqual(['/api/v1/auth/me', '/api/v1/auth/admin/login']);
    } finally {
      await act(async () => { finishStartup(); finishLogin(); await Promise.all([startup, login]); });
      view.unmount(); router.dispose(); globalThis.fetch = previousFetch;
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    }
  }
});
