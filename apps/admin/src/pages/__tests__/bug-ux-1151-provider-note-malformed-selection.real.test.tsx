import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { NotesTab } from '../ProviderDetailPage';

it('Bug UX-1151 — Provider 360 rejects a malformed note evidence ID before requesting the active note list', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotesTab providerId="provider-1" exactNoteId="not-a-uuid" />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Provider note ID must be a complete UUID');
  expect(screen.queryByText('Exact provider note evidence')).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});
