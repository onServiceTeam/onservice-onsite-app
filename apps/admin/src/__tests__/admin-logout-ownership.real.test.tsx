import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

const originalFetch = globalThis.fetch;
const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
const logoutPath = '/api/v1/auth/admin/logout';
const mePath = '/api/v1/auth/me';
const passwordPath = '/api/v1/security/admin/me/change-password';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200
  ? { success: true, data } : { success: false, error: { message: 'Synthetic server failure' } }), { status });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function start() {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=synthetic-session; Path=/';
  window.history.replaceState(null, '', '/change-password');
  return render(<BrowserRouter><App /></BrowserRouter>);
}
async function clickLogout() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open admin account menu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
}
afterEach(() => {
  cleanup(); globalThis.fetch = originalFetch;
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  window.history.replaceState(null, '', '/');
});

it('current logout still clears protected pages and reaches login for each admin role on success or failure', async () => {
  for (const role of ['admin', 'super_admin', 'dpo'] as const) {
    for (const outcome of ['success', 'server-failure', 'transport-failure']) {
      const requests: string[] = [];
      globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const path = String(input); requests.push(path);
        if (path === mePath) return response({ ...actor, role, mustRotatePassword: true });
        if (path === logoutPath) {
          if (outcome === 'transport-failure') throw new TypeError('Synthetic network failure');
          if (outcome === 'success') document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
          return response({}, outcome === 'server-failure' ? 500 : 200);
        }
        throw new Error(`Unexpected synthetic request: ${path}`);
      }) as typeof fetch;
      const view = start();
      try {
        expect(await screen.findByText('Password rotation required')).toBeVisible();
        await clickLogout();
        expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Change password' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Open admin account menu' })).toBeNull();
        expect(window.location.pathname).toBe('/login');
        expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, isLoading: false, mustRotatePassword: false });
        expect(requests).toEqual([mePath, logoutPath]);
      } finally { view.unmount(); }
    }
  }
});

it('an older successful or failed logout cannot clear same-ID reauthentication or its new requirement', async () => {
  for (const outcome of [200, 500, 'network'] as const) {
    const pending = deferred();
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      if (String(input) === mePath) return response({ ...actor, mustRotatePassword: false });
      if (String(input) !== logoutPath) throw new Error('Unexpected synthetic request');
      await pending.promise;
      if (outcome === 'network') throw new TypeError('Synthetic old logout failure');
      return response({}, outcome);
    }) as typeof fetch;
    const view = start();
    try {
      await clickLogout();
      act(() => { useAuthStore.getState().login(actor, { mustRotatePassword: true }); });
      expect(screen.getByText('Password rotation required')).toBeVisible();
      await act(async () => { pending.resolve(); await pending.promise; });
      expect(screen.getByText('Password rotation required')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull();
      expect(window.location.pathname).toBe('/change-password');
      expect(useAuthStore.getState()).toMatchObject({ user: actor, isAuthenticated: true, mustRotatePassword: true });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally { await act(async () => { pending.resolve(); await pending.promise; }); view.unmount(); }
  }
});

it('earlier duplicate logout completion leaves the current logout in control until it settles', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === mePath) return response({ ...actor, mustRotatePassword: false });
    if (String(input) !== logoutPath) throw new Error('Unexpected synthetic request');
    calls += 1; await (calls === 1 ? first.promise : second.promise);
    return response({});
  }) as typeof fetch;
  start();
  try {
    await clickLogout(); fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => { first.resolve(); await first.promise; });
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    await act(async () => { second.resolve(); await second.promise; });
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  } finally { await act(async () => { first.resolve(); second.resolve(); await Promise.all([first.promise, second.promise]); }); }
});

it('a startup read during current logout cannot cancel logout or restore the signed-out actor in either completion order', async () => {
  for (const order of ['startup-first', 'logout-first']) {
    const pendingLogout = deferred(), pendingStartup = deferred();
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      if (String(input) === mePath) {
        reads += 1; if (reads === 2) await pendingStartup.promise;
        return response({ ...actor, mustRotatePassword: reads === 2 });
      }
      if (String(input) !== logoutPath) throw new Error('Unexpected synthetic request');
      await pendingLogout.promise; return response({});
    }) as typeof fetch;
    const view = start();
    let hydration: Promise<void> | undefined;
    try {
      await clickLogout(); hydration = useAuthStore.getState().hydrate();
      if (order === 'startup-first') {
        await act(async () => { pendingStartup.resolve(); await hydration; });
        expect(screen.getByText('Password rotation required')).toBeVisible();
      }
      await act(async () => { pendingLogout.resolve(); await pendingLogout.promise; });
      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await act(async () => { pendingStartup.resolve(); await hydration; });
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, isLoading: false, mustRotatePassword: false });
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    } finally {
      await act(async () => { pendingLogout.resolve(); pendingStartup.resolve(); await hydration; });
      view.unmount();
    }
  }
});

it('a completed password replacement cannot be undone locally by an earlier logout response', async () => {
  const pending = deferred();
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === mePath) return response({ ...actor, mustRotatePassword: false });
    if (String(input) === logoutPath) { await pending.promise; return response({}); }
    if (String(input) === passwordPath) return response({ message: 'Synthetic password changed' });
    throw new Error('Unexpected synthetic request');
  }) as typeof fetch;
  start();
  try {
    await clickLogout();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(await screen.findByLabelText(/^Current password/), { target: { value: 'synthetic-old-password-1234' } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'synthetic-new-password-1234' } });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'synthetic-new-password-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(screen.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(useAuthStore.getState()).toMatchObject({ user: actor, isAuthenticated: true, mustRotatePassword: false });
    expect(window.location.pathname).toBe('/change-password');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  } finally { await act(async () => { pending.resolve(); await pending.promise; }); }
});
