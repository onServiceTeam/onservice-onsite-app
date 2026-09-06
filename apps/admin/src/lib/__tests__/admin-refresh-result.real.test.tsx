import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import api from '../api';
import { useAuthStore } from '@/stores/auth.store';

const originalFetch = globalThis.fetch;
const endpoint = '/api/v1/admin/synthetic-refresh-result';
const refresh = '/api/v1/auth/admin/refresh';

function ResultPanel(): React.ReactElement {
  const [result, setResult] = useState('Not requested');
  return <><output aria-label="Request result">{result}</output><button onClick={() => {
    void api.get(endpoint).then(() => setResult('Success'), error => setResult(error.message));
  }}>Read current record</button></>;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  window.history.replaceState(null, '', '/');
});

it('a post-refresh rotation precondition retains its actual message and required destination', async () => {
  window.history.replaceState(null, '', '/providers');
  const trace: string[] = [];
  const popstate = vi.fn();
  window.addEventListener('popstate', popstate);
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = String(input); trace.push(path);
    if (path === refresh) return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    const status = trace.length === 1 ? 401 : 428;
    return new Response(JSON.stringify({ success: false, error: {
      message: status === 401 ? 'Synthetic expired access' : 'Synthetic current password rotation required',
      ...(status === 428 ? { code: 'password_rotation_required' } : {}),
    } }), { status });
  }) as typeof fetch;
  const view = render(<ResultPanel />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read current record' }));
    await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Synthetic current password rotation required'));
    expect(window.location.pathname).toBe('/change-password');
    expect(popstate).toHaveBeenCalledTimes(1);
    expect(trace).toEqual([endpoint, refresh, endpoint]);
  } finally { view.unmount(); window.removeEventListener('popstate', popstate); }
});

it('an unsuccessful refresh stops without replaying the business request or reloading an existing login page', async () => {
  window.history.replaceState(null, '', '/login');
  const trace: string[] = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    trace.push(String(input));
    return new Response(JSON.stringify({ success: false, error: { message: 'Synthetic expired session' } }), { status: 401 });
  }) as typeof fetch;
  const view = render(<ResultPanel />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read current record' }));
    await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Synthetic expired session'));
    expect(trace).toEqual([endpoint, refresh]);
    expect(window.location.pathname).toBe('/login');
  } finally { view.unmount(); }
});

it('a failed retried transport surfaces its actual failure without a second refresh', async () => {
  window.history.replaceState(null, '', '/providers');
  const trace: string[] = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = String(input); trace.push(path);
    if (path === refresh) return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    if (trace.length === 1) return new Response(JSON.stringify({ success: false, error: { message: 'Synthetic expired access' } }), { status: 401 });
    throw new TypeError('Synthetic retried network failure');
  }) as typeof fetch;
  const view = render(<ResultPanel />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Read current record' }));
    await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Synthetic retried network failure'));
    expect(trace).toEqual([endpoint, refresh, endpoint]);
    expect(window.location.pathname).toBe('/providers');
  } finally { view.unmount(); }
});
