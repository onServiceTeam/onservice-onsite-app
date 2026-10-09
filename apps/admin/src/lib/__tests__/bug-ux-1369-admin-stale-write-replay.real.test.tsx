import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import api from '../api';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

const notesPath = '/api/v1/admin/providers/cccccccc-cccc-4ccc-8ccc-cccccccccccc/notes';
const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
  firstName: 'Old', lastName: 'Operator', email: 'old@example.invalid', phone: '', avatarUrl: null };
const nextActor: AdminUser = { ...actor, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  firstName: 'New', email: 'new@example.invalid' };

function RequestControls(): React.ReactElement {
  const session = useAuthStore();
  const [result, setResult] = useState('Idle');
  const beginNote = (): void => {
    setResult('Waiting');
    void api.post(notesPath, { body: 'Old operator draft', category: 'general', pinned: false })
      .then(() => setResult('Saved'), () => setResult('Request stopped'));
  };
  const signIn = async (): Promise<void> => {
    const response = await api.post('/api/v1/auth/admin/login', {
      email: nextActor.email, password: 'synthetic-test-only-not-a-credential',
    });
    session.login(response.data.data.user);
  };
  return <>
    <output aria-label="Current operator">{session.user?.email ?? 'Signed out'}</output>
    <output aria-label="Old note result">{result}</output>
    <button onClick={beginNote}>Start old note</button>
    <button onClick={() => { void session.logout(); }}>Sign out</button>
    <button onClick={() => { void signIn(); }}>Sign in next operator</button>
  </>;
}

it('Bug UX-1369 — an old operator write rejected after logout/login must not refresh and replay under the new operator', async () => {
  const previousFetch = globalThis.fetch;
  let finish!: () => void;
  const barrier = new Promise<void>(resolve => { finish = resolve; });
  let activeActor = actor.id;
  const trace: Array<{ path: string; actorId: string; csrf: string | null }> = [];
  const response = (status: number, data: unknown): Response => ({
    ok: status < 400, status, text: async () => JSON.stringify(data),
  }) as Response;
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    trace.push({ path: url, actorId: activeActor, csrf: new Headers(init?.headers).get('X-CSRF-Token') });
    if (url === notesPath && trace.filter(row => row.path === notesPath).length === 1) {
      await barrier;
      return response(401, { success: false, error: { message: 'Synthetic old session expired' } });
    }
    if (url === '/api/v1/auth/admin/logout') {
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
      return response(200, { success: true, data: {} });
    }
    if (url === '/api/v1/auth/admin/login') {
      activeActor = nextActor.id;
      document.cookie = 'admin_csrf=synthetic-new-session; Path=/';
      return response(200, { success: true, data: { user: nextActor } });
    }
    if (url === '/api/v1/auth/admin/refresh') {
      document.cookie = 'admin_csrf=synthetic-refreshed-new-session; Path=/';
      return response(200, { success: true, data: { user: nextActor } });
    }
    if (url === notesPath) return response(200, { success: true, data: { id: 'synthetic-note' } });
    throw new Error(`Unexpected synthetic fetch: ${url}`);
  }) as typeof fetch;
  document.cookie = 'admin_csrf=synthetic-old-session; Path=/';
  useAuthStore.setState({ user: actor, isAuthenticated: true, isLoading: false, mustRotatePassword: false });
  const view = render(<RequestControls />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Start old note' }));
    await waitFor(() => expect(trace.filter(row => row.path === notesPath)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Current operator')).toHaveTextContent('Signed out'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in next operator' }));
    await waitFor(() => expect(screen.getByLabelText('Current operator')).toHaveTextContent(nextActor.email!));
    await act(async () => { finish(); await barrier; });
    await waitFor(() => expect(screen.getByLabelText('Old note result')).not.toHaveTextContent('Waiting'));
    expect(trace.filter(row => row.path === notesPath)).toEqual([
      { path: notesPath, actorId: actor.id, csrf: 'synthetic-old-session' },
    ]);
    expect(trace.filter(row => row.path === '/api/v1/auth/admin/refresh')).toHaveLength(0);
    expect(screen.getByLabelText('Old note result')).toHaveTextContent('Request stopped');
    expect(screen.getByLabelText('Current operator')).toHaveTextContent(nextActor.email!);
  } finally {
    await act(async () => { finish(); await barrier; });
    view.unmount(); globalThis.fetch = previousFetch;
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
    document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  }
});
