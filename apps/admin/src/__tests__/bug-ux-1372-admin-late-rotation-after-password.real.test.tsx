import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
const probe = vi.hoisted(() => ({ settled: vi.fn() }));
vi.mock('@/pages/DashboardPage', () => ({ default: () => <button onClick={() => {
  void api.get('/api/v1/admin/synthetic-delayed-rotation').then(probe.settled, probe.settled);
}}>Start pending record read</button> }));
import api from '../lib/api';
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('Bug UX-1372 — a response from before a successful password change cannot send the operator back into obsolete rotation', async () => {
  const previousFetch = globalThis.fetch;
  const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
  let finishOld!: () => void;
  const barrier = new Promise<void>(resolve => { finishOld = resolve; });
  const requests: string[] = [];
  probe.settled.mockReset();
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = String(input); requests.push(path);
    if (path === '/api/v1/auth/me') return new Response(JSON.stringify({ success: true,
      data: { ...actor, mustRotatePassword: false } }), { status: 200 });
    if (path === '/api/v1/admin/synthetic-delayed-rotation') {
      await barrier;
      return new Response(JSON.stringify({ success: false,
        error: { message: 'Synthetic old rotation requirement', code: 'password_rotation_required' } }), { status: 428 });
    }
    if (path === '/api/v1/security/admin/me/change-password') {
      expect(JSON.parse(String(init?.body))).toEqual({
        oldPassword: 'synthetic-old-password-1234', newPassword: 'synthetic-new-password-1234',
      });
      document.cookie = 'admin_csrf=synthetic-replacement-session; Path=/';
      return new Response(JSON.stringify({ success: true, data: { message: 'Synthetic password changed' } }), { status: 200 });
    }
    throw new Error(`Unexpected synthetic request: ${path}`);
  }) as typeof fetch;
  document.cookie = 'admin_csrf=synthetic-original-session; Path=/';
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  window.history.replaceState(null, '', '/');
  const view = render(<BrowserRouter><App /></BrowserRouter>);
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Start pending record read' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(await screen.findByLabelText(/^Current password/), { target: { value: 'synthetic-old-password-1234' } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'synthetic-new-password-1234' } });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'synthetic-new-password-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to operations' }));
    expect(await screen.findByRole('button', { name: 'Start pending record read' })).toBeVisible();
    await act(async () => { finishOld(); await barrier; });
    await waitFor(() => expect(probe.settled).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('heading', { name: 'Change password' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start pending record read' })).toBeVisible();
    expect(useAuthStore.getState().mustRotatePassword).toBe(false);
    expect(useAuthStore.getState().user?.id).toBe(actor.id);
    expect(requests).toEqual(['/api/v1/auth/me', '/api/v1/admin/synthetic-delayed-rotation', '/api/v1/security/admin/me/change-password']);
  } finally {
    await act(async () => { finishOld(); await barrier; });
    view.unmount(); globalThis.fetch = previousFetch;
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    window.history.replaceState(null, '', '/');
  }
});
