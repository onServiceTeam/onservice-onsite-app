import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('@/lib/api');
vi.unmock('@/stores/auth.store');
import { NotesTab } from '../ProviderDetailPage';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

afterEach(() => { window.history.replaceState(null, '', '/'); });

it('Bug UX-1370 — a provider-note failure after successful session refresh shows the actual business error and preserves the draft', async () => {
  const previousFetch = globalThis.fetch;
  const providerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const notesPath = `/api/v1/admin/providers/${providerId}/notes`;
  const refreshPath = '/api/v1/auth/admin/refresh';
  const actor: AdminUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    firstName: 'Synthetic', lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null };
  // jsdom cannot perform full-document navigation. The real browser follow-up
  // covers staying on the provider route; this test isolates the rendered error.
  window.history.replaceState(null, '', '/login');
  for (const status of [409, 403, 500]) {
    const message = `Synthetic note save rejected (${status}). Check the current provider record.`;
    const trace: Array<{ path: string; method: string; csrf: string | null; body: unknown }> = [];
    let attempts = 0;
    useAuthStore.getState().login(actor);
    document.cookie = 'admin_csrf=synthetic-original-note-session; Path=/';
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const path = String(input), method = String(init?.method);
      trace.push({ path, method, csrf: new Headers(init?.headers).get('X-CSRF-Token'), body: init?.body });
      if (path === refreshPath && method === 'POST') {
        document.cookie = 'admin_csrf=synthetic-refreshed-note-session; Path=/';
        return new Response(JSON.stringify({ success: true, data: { user: actor } }), { status: 200 });
      }
      if (path === notesPath && method === 'POST') {
        attempts += 1;
        return new Response(JSON.stringify({ success: false, error: {
          message: attempts === 1 ? 'Synthetic expired access token' : message,
        } }), { status: attempts === 1 ? 401 : status });
      }
      throw new Error(`Unexpected synthetic request: ${method} ${path}`);
    }) as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    client.setQueryData(['admin-provider-notes', providerId], []);
    const view = render(<QueryClientProvider client={client}><NotesTab providerId={providerId} /></QueryClientProvider>);
    try {
      fireEvent.change(screen.getByRole('textbox', { name: 'Internal note' }), { target: { value: 'Synthetic support note draft' } });
      fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), { target: { value: 'quality' } });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Pin to top' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
      expect(screen.getByRole('textbox', { name: 'Internal note' })).toHaveValue('Synthetic support note draft');
      expect(screen.getByRole('combobox', { name: 'Note category' })).toHaveValue('quality');
      expect(screen.getByRole('checkbox', { name: 'Pin to top' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Save Note' })).toBeEnabled();
      const body = JSON.stringify({ body: 'Synthetic support note draft', category: 'quality', pinned: true });
      expect(trace).toEqual([
        { path: notesPath, method: 'POST', csrf: 'synthetic-original-note-session', body },
        { path: refreshPath, method: 'POST', csrf: 'synthetic-original-note-session', body: '{}' },
        { path: notesPath, method: 'POST', csrf: 'synthetic-refreshed-note-session', body },
      ]);
      expect(useAuthStore.getState().user?.id).toBe(actor.id);
    } finally {
      view.unmount(); client.clear(); globalThis.fetch = previousFetch;
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, mustRotatePassword: false });
      document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
    }
  }
});
