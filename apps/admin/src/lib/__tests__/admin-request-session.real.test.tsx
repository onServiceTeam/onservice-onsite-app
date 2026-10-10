import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import api from '../api';
import { AdminSessionChangedError } from '../admin-request-session';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

const oldActor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Old', lastName: 'Operator', email: 'old@example.invalid', phone: '', avatarUrl: null };
const newActor: AdminUser = { ...oldActor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'new@example.invalid' };
const previousFetch = globalThis.fetch;
const endpoint = '/api/v1/admin/synthetic-request-fixture';
const refresh = '/api/v1/auth/admin/refresh';

function deferred(): { promise: Promise<void>; finish: () => void } {
  let finish!: () => void;
  const promise = new Promise<void>(resolve => { finish = resolve; });
  return { promise, finish };
}

function response(status: number, data: unknown): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(data) } as Response;
}

function Panel({ run, transition = () => useAuthStore.getState().login(newActor) }: {
  run: () => Promise<string>;
  transition?: () => void;
}): React.ReactElement {
  const actor = useAuthStore(state => state.user);
  const [result, setResult] = useState('Idle');
  return <>
    <output aria-label="Current operator">{actor?.email ?? 'Signed out'}</output>
    <output aria-label="Request result">{result}</output>
    <button onClick={() => {
      setResult('Waiting');
      void run().then(setResult, error => setResult(error instanceof AdminSessionChangedError
        ? 'Session changed' : error?.name === 'AbortError' ? 'Cancelled' : 'Request failed'));
    }}>Start request</button>
    <button onClick={transition}>Change session</button>
  </>;
}

beforeEach(() => {
  document.cookie = 'admin_csrf=synthetic-old-session; Path=/';
  useAuthStore.getState().login(oldActor);
  window.history.replaceState(null, '', '/providers');
});
afterEach(() => {
  cleanup(); globalThis.fetch = previousFetch;
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  window.history.replaceState(null, '', '/');
});

it('same-owner refresh still rotates CSRF and retries the intended write exactly once', async () => {
  const trace: Array<{ url: string; csrf: string | null; body: unknown }> = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    trace.push({ url, csrf: new Headers(init?.headers).get('X-CSRF-Token'), body: init?.body });
    if (trace.length === 1) return response(401, { success: false, error: { message: 'Expired access' } });
    if (url === refresh) {
      document.cookie = 'admin_csrf=synthetic-same-owner-refresh; Path=/';
      return response(200, { success: true, data: { user: oldActor } });
    }
    return response(200, { success: true, data: 'Saved current operator draft' });
  }) as typeof fetch;
  render(<Panel run={async () => (await api.post(endpoint, { body: 'Current draft' })).data.data} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
  await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Saved current operator draft'));
  expect(trace).toEqual([
    { url: endpoint, csrf: 'synthetic-old-session', body: JSON.stringify({ body: 'Current draft' }) },
    { url: refresh, csrf: 'synthetic-old-session', body: '{}' },
    { url: endpoint, csrf: 'synthetic-same-owner-refresh', body: JSON.stringify({ body: 'Current draft' }) },
  ]);
  expect(screen.getByLabelText('Current operator')).toHaveTextContent(oldActor.email!);
});

it('private JSON and blob parsing finishing after an operator change cannot return old data', async () => {
  for (const kind of ['json', 'blob'] as const) {
    useAuthStore.getState().login(oldActor);
    const delayed = deferred();
    globalThis.fetch = vi.fn(async () => {
      const body = kind === 'json' ? JSON.stringify({ success: true, data: 'Old private JSON' }) : 'Old private document';
      const stream = new globalThis.ReadableStream({ async start(controller) {
        await delayed.promise;
        controller.enqueue(new globalThis.TextEncoder().encode(body));
        controller.close();
      } });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    const view = render(<Panel run={async () => kind === 'json'
      ? (await api.get(endpoint)).data.data
      : (await api.get<Blob>(endpoint, { responseType: 'blob' })).data.text()} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Change session' }));
      await act(async () => { delayed.finish(); await delayed.promise; });
      await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Session changed'));
      expect(screen.queryByText(/Old private/)).toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally { await act(async () => { delayed.finish(); await delayed.promise; }); view.unmount(); }
  }
});

it('stale expired, failed and password-rotation responses cannot retry or redirect a new operator', async () => {
  for (const status of [401, 500, 428]) {
    useAuthStore.getState().login(oldActor);
    const delayed = deferred();
    globalThis.fetch = vi.fn(async () => {
      await delayed.promise;
      return response(status, { success: false, error: { message: 'Obsolete response',
        ...(status === 428 ? { code: 'password_rotation_required' } : {}) } });
    }) as typeof fetch;
    const view = render(<Panel run={async () => (await api.get(endpoint)).data.data} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Change session' }));
      await act(async () => { delayed.finish(); await delayed.promise; });
      await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Session changed'));
      expect(window.location.pathname).toBe('/providers');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Current operator')).toHaveTextContent(newActor.email!);
    } finally { await act(async () => { delayed.finish(); await delayed.promise; }); view.unmount(); }
  }
});

it('an operator change during refresh prevents replay even if that old refresh later succeeds or fails', async () => {
  for (const status of [200, 401]) {
    useAuthStore.getState().login(oldActor);
    const delayed = deferred();
    const trace: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input); trace.push(url);
      if (url === endpoint) return response(401, { success: false, error: { message: 'Expired access' } });
      await delayed.promise;
      // A real browser may still receive this cookie from a request already
      // sent. This test verifies no business replay, not cookie arbitration.
      if (status === 200) document.cookie = 'admin_csrf=synthetic-retired-refresh-cookie; Path=/';
      return response(status, status === 200 ? { success: true, data: { user: oldActor } }
        : { success: false, error: { message: 'Old refresh rejected' } });
    }) as typeof fetch;
    const view = render(<Panel run={async () => (await api.post(endpoint, { body: 'Old draft' })).data.data} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
      await waitFor(() => expect(trace).toEqual([endpoint, refresh]));
      fireEvent.click(screen.getByRole('button', { name: 'Change session' }));
      await act(async () => { delayed.finish(); await delayed.promise; });
      await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Session changed'));
      expect(trace).toEqual([endpoint, refresh]);
      expect(window.location.pathname).toBe('/providers');
      expect(screen.getByLabelText('Current operator')).toHaveTextContent(newActor.email!);
      if (status === 200) expect(document.cookie).toContain('admin_csrf=synthetic-retired-refresh-cookie');
    } finally { await act(async () => { delayed.finish(); await delayed.promise; }); view.unmount(); }
  }
});

it('an already cancelled request does not fetch, and cancelling an outstanding expired response does not refresh', async () => {
  for (const timing of ['before', 'outstanding'] as const) {
    const controller = new AbortController();
    const delayed = deferred();
    globalThis.fetch = vi.fn(async () => {
      await delayed.promise;
      return response(401, { success: false, error: { message: 'Expired cancelled request' } });
    }) as typeof fetch;
    if (timing === 'before') controller.abort();
    const view = render(<Panel run={async () => (await api.get(endpoint, { signal: controller.signal })).data.data} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
      if (timing === 'outstanding') await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      await act(async () => { controller.abort(); delayed.finish(); await delayed.promise; });
      await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Cancelled'));
      expect(globalThis.fetch).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1);
      expect(window.location.pathname).toBe('/providers');
    } finally { await act(async () => { delayed.finish(); await delayed.promise; }); view.unmount(); }
  }
});

it('same-ID reauthentication and a hydrated role change retire outstanding private requests', async () => {
  for (const change of ['reauthentication', 'hydrated-role'] as const) {
    useAuthStore.getState().login(oldActor);
    const delayed = deferred();
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      if (String(input) === '/api/v1/auth/me') return response(200, { success: true, data: { ...oldActor, role: 'dpo' } });
      await delayed.promise;
      return response(200, { success: true, data: 'Old private payload' });
    }) as typeof fetch;
    const transition = (): void => {
      if (change === 'reauthentication') useAuthStore.getState().login(oldActor);
      else void useAuthStore.getState().hydrate();
    };
    const view = render(<Panel transition={transition} run={async () => (await api.get(endpoint)).data.data} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Start request' }));
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Change session' }));
      if (change === 'hydrated-role') await waitFor(() => expect(useAuthStore.getState().user?.role).toBe('dpo'));
      await act(async () => { delayed.finish(); await delayed.promise; });
      await waitFor(() => expect(screen.getByLabelText('Request result')).toHaveTextContent('Session changed'));
      expect(screen.queryByText('Old private payload')).toBeNull();
      expect(useAuthStore.getState().user?.id).toBe(oldActor.id);
    } finally { await act(async () => { delayed.finish(); await delayed.promise; }); view.unmount(); }
  }
});
