import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import api from '../lib/api';
import { captureAdminRequestSession } from '../lib/admin-request-session';
import { useAuthStore, type AdminUser } from '../stores/auth.store';
import ChangePasswordPage from '../pages/ChangePasswordPage';

const originalFetch = globalThis.fetch;
const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
const passwordPath = '/api/v1/security/admin/me/change-password';
const probePath = '/api/v1/admin/synthetic-rotation';
const success = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const failure = (status = 428, code: string | undefined = 'password_rotation_required') =>
  new Response(JSON.stringify({ success: false, error: { message: 'Synthetic rejected request', code } }), { status });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function renderPassword() {
  return render(<MemoryRouter initialEntries={['/change-password']}><ChangePasswordPage /></MemoryRouter>);
}
function fillPassword() {
  fireEvent.change(screen.getByLabelText(/^Current password/), { target: { value: 'synthetic-old-password-1234' } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'synthetic-new-password-1234' } });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'synthetic-new-password-1234' } });
}
beforeEach(() => {
  useAuthStore.getState().login(actor);
  document.cookie = 'admin_csrf=synthetic-current-session; Path=/';
  window.history.replaceState(null, '', '/change-password');
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  window.history.replaceState(null, '', '/');
});

it('a requirement on the already-open page preserves all fields without extra history navigation', async () => {
  globalThis.fetch = vi.fn(async () => failure()) as typeof fetch;
  const popstate = vi.fn();
  window.addEventListener('popstate', popstate);
  renderPassword(); fillPassword();
  try {
    const oldSession = captureAdminRequestSession();
    await act(async () => { await api.get(probePath).catch(() => {}); });
    expect(screen.getByText('Password rotation required')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('synthetic-old-password-1234');
    expect(screen.getByLabelText(/^New password/)).toHaveValue('synthetic-new-password-1234');
    expect(screen.getByLabelText(/^Confirm new password/)).toHaveValue('synthetic-new-password-1234');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
    expect(captureAdminRequestSession()).toBe(oldSession);
    expect(popstate).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('popstate', popstate); }
});

it('an earlier startup response cannot clear a newly observed requirement', async () => {
  const old = deferred();
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === '/api/v1/auth/me') { await old.promise; return success({ ...actor, mustRotatePassword: false }); }
    return failure();
  }) as typeof fetch;
  renderPassword();
  const hydration = useAuthStore.getState().hydrate();
  try {
    await act(async () => { await api.get(probePath).catch(() => {}); });
    expect(screen.getByText('Password rotation required')).toBeVisible();
    await act(async () => { old.resolve(); await hydration; });
    expect(screen.getByText('Password rotation required')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: actor, isAuthenticated: true, isLoading: false, mustRotatePassword: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally { await act(async () => { old.resolve(); await hydration; }); }
});

it('successful replacement invalidates earlier hydration and a new current requirement still opens the form', async () => {
  useAuthStore.getState().login(actor, { mustRotatePassword: true });
  const old = deferred();
  const trace: string[] = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = String(input); trace.push(path);
    if (path === '/api/v1/auth/me') { await old.promise; return success({ ...actor, mustRotatePassword: true }); }
    if (path === passwordPath) {
      expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('synthetic-current-session');
      expect(JSON.parse(String(init?.body))).toEqual({ oldPassword: 'synthetic-old-password-1234', newPassword: 'synthetic-new-password-1234' });
      document.cookie = 'admin_csrf=synthetic-replaced-session; Path=/';
      return success({ message: 'Synthetic updated password' });
    }
    if (path === probePath) return failure();
    throw new Error(`Unexpected synthetic request: ${path}`);
  }) as typeof fetch;
  renderPassword(); fillPassword();
  const oldSession = captureAdminRequestSession();
  const hydration = useAuthStore.getState().hydrate();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(captureAdminRequestSession()).not.toBe(oldSession);
    await act(async () => { old.resolve(); await hydration; });
    expect(screen.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(screen.queryByText('Password rotation required')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: actor, isAuthenticated: true, isLoading: false, mustRotatePassword: false });
    // This is a new server requirement, not the obsolete response above.
    await act(async () => { await api.get(probePath).catch(() => {}); });
    expect(screen.getByText('Password rotation required')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Password updated' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue to operations' })).toBeNull();
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('');
    expect(screen.getByLabelText(/^New password/)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
    expect(trace).toEqual(['/api/v1/auth/me', passwordPath, probePath]);
  } finally { await act(async () => { old.resolve(); await hydration; }); }
});

it('a requirement arriving during password submission does not cancel a successful replacement', async () => {
  const pending = deferred();
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === passwordPath) { await pending.promise; return success({}); }
    return failure();
  }) as typeof fetch;
  renderPassword(); fillPassword();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await act(async () => { await api.get(probePath).catch(() => {}); });
    expect(screen.getByText('Password rotation required')).toBeVisible();
    expect(screen.getByLabelText(/^New password/)).toHaveValue('synthetic-new-password-1234');
    expect(screen.getByRole('button', { name: 'Updating password...' })).toBeDisabled();
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(screen.queryByText('Password rotation required')).toBeNull();
    expect(useAuthStore.getState().mustRotatePassword).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally { pending.resolve(); }
});

it('a failed password submission keeps the requirement and the current request lifetime', async () => {
  useAuthStore.getState().login(actor, { mustRotatePassword: true });
  globalThis.fetch = vi.fn(async () => failure(400, 'incorrect_password')) as typeof fetch;
  renderPassword(); fillPassword();
  const current = captureAdminRequestSession();
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic rejected request');
  expect(screen.getByText('Password rotation required')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  expect(captureAdminRequestSession()).toBe(current);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

it('obsolete and aborted requirements cannot mark a newer sign-in or a cancelled request mandatory', async () => {
  for (const transition of ['same-actor-login', 'different-actor-login', 'abort'] as const) {
    useAuthStore.getState().login(actor);
    const pending = deferred();
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => { await pending.promise; return failure(); }) as typeof fetch;
    const view = renderPassword();
    const request = api.get(probePath, { signal: controller.signal }).catch(error => error);
    try {
      await act(async () => {
        if (transition === 'abort') controller.abort();
        else useAuthStore.getState().login(transition === 'same-actor-login' ? actor : { ...actor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
        pending.resolve(); await request;
      });
      expect(screen.queryByText('Password rotation required')).toBeNull();
      expect(screen.getByRole('button', { name: 'Cancel and return' })).toBeVisible();
      expect(useAuthStore.getState().mustRotatePassword).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally { pending.resolve(); await request; view.unmount(); }
  }
});

it('a generic precondition does not become a password requirement and an obsolete completion cannot clear one', async () => {
  globalThis.fetch = vi.fn(async () => failure(428, 'different_precondition')) as typeof fetch;
  renderPassword();
  await act(async () => { await api.get(probePath).catch(() => {}); });
  expect(screen.queryByText('Password rotation required')).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel and return' })).toBeVisible();
  const oldSession = captureAdminRequestSession();
  act(() => { useAuthStore.getState().login(actor, { mustRotatePassword: true }); });
  expect(() => useAuthStore.getState().clearMustRotate(oldSession)).toThrow('sign-in changed');
  expect(screen.getByText('Password rotation required')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
  await waitFor(() => expect(useAuthStore.getState().mustRotatePassword).toBe(true));
});
