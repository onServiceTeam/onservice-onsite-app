import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
// App, Header, LoginPage, store and transport remain real.
vi.mock('@/pages/DashboardPage', () => ({ default: () => <h1>Current operator workspace</h1> }));
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('Bug UX-1373 — an older duplicate sign-out completion cannot clear a newer real login or navigate its operator away', async () => {
  const originalFetch = globalThis.fetch;
  const oldActor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin',
    firstName: 'Old', lastName: 'Supervisor', email: 'old@example.invalid', phone: '', avatarUrl: null };
  const newActor: AdminUser = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'admin', firstName: 'New', email: 'new@example.invalid' };
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  let logoutCalls = 0;
  const requests: string[] = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = String(input); requests.push(path);
    let data: unknown;
    if (path === '/api/v1/auth/me') data = { ...oldActor, mustRotatePassword: false };
    else if (path === '/api/v1/auth/admin/logout') {
      logoutCalls += 1;
      const attempt = logoutCalls;
      await (attempt === 1 ? first : second);
      // Scope this regression to local completion/navigation. Late Set-Cookie
      // headers on an old logout are a separate unresolved server/cookie race.
      if (attempt === 2) document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
      data = {};
    } else if (path === '/api/v1/auth/admin/login') {
      expect(JSON.parse(String(init?.body))).toEqual({ email: newActor.email, password: 'synthetic-password-not-a-live-credential' });
      document.cookie = 'admin_csrf=synthetic-new-operator; Path=/';
      data = { user: newActor, mustRotatePassword: false };
    } else throw new Error(`Unexpected synthetic request: ${path}`);
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as typeof fetch;
  document.cookie = 'admin_csrf=synthetic-old-operator; Path=/';
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  window.history.replaceState(null, '', '/');
  const view = render(<BrowserRouter><App /></BrowserRouter>);
  try {
    expect(await screen.findByRole('heading', { name: 'Current operator workspace' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
    const logout = screen.getByRole('button', { name: 'Log out' });
    fireEvent.click(logout); fireEvent.click(logout);
    await waitFor(() => expect(logoutCalls).toBe(2));
    await act(async () => { releaseSecond(); await second; });
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: newActor.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password-not-a-live-credential' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('heading', { name: 'Current operator workspace' })).toBeVisible();
    expect(useAuthStore.getState().user?.id).toBe(newActor.id);
    await act(async () => { releaseFirst(); await first; });
    expect(useAuthStore.getState().user?.id).toBe(newActor.id);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Current operator workspace' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
    expect(screen.getByText('new@example.invalid')).toBeVisible();
    expect(requests).toEqual(['/api/v1/auth/me', '/api/v1/auth/admin/logout', '/api/v1/auth/admin/logout', '/api/v1/auth/admin/login']);
  } finally {
    await act(async () => { releaseFirst(); releaseSecond(); await Promise.all([first, second]); });
    view.unmount(); globalThis.fetch = originalFetch;
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    window.history.replaceState(null, '', '/');
  }
});
