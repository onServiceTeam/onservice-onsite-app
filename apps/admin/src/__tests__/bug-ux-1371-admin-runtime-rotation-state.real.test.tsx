import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
// Only the dashboard content is reduced. App, Header, auth state, API,
// BrowserRouter, password form and mandatory-route guard are real.
vi.mock('@/pages/DashboardPage', () => ({ default: () => <button onClick={() => {
  void api.get('/api/v1/admin/synthetic-rotation-probe').catch(() => {});
}}>Read current record</button> }));
import api from '../lib/api';
import App from '../App';
import { useAuthStore, type AdminUser } from '../stores/auth.store';

it('Bug UX-1371 — a current runtime rotation requirement marks the real password screen mandatory and keeps other routes gated', async () => {
  const previousFetch = globalThis.fetch;
  const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
  const requests: string[] = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = String(input); requests.push(path);
    if (path === '/api/v1/auth/me') return new Response(JSON.stringify({ success: true,
      data: { ...actor, mustRotatePassword: false } }), { status: 200 });
    if (path === '/api/v1/admin/synthetic-rotation-probe') return new Response(JSON.stringify({ success: false,
      error: { message: 'Synthetic password rotation required now', code: 'password_rotation_required' } }), { status: 428 });
    throw new Error(`Unexpected synthetic request: ${path}`);
  }) as typeof fetch;
  document.cookie = 'admin_csrf=synthetic-runtime-session; Path=/';
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  window.history.replaceState(null, '', '/');
  const view = render(<BrowserRouter><App /></BrowserRouter>);
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Read current record' }));
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeVisible();
    expect(await screen.findByText('Password rotation required', { exact: true })).toBeVisible();
    expect(useAuthStore.getState().mustRotatePassword).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel and return' })).toBeNull();
    await act(async () => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new Event('popstate'));
    });
    await waitFor(() => expect(window.location.pathname).toBe('/change-password'));
    expect(screen.queryByRole('button', { name: 'Read current record' })).toBeNull();
    expect(requests).toEqual(['/api/v1/auth/me', '/api/v1/admin/synthetic-rotation-probe']);
  } finally {
    view.unmount(); globalThis.fetch = previousFetch;
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    window.history.replaceState(null, '', '/');
  }
});
