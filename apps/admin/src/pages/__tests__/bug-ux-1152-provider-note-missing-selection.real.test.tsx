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

it('Bug UX-1152 — Provider 360 shows no substitute when a valid note evidence ID is absent from the active provider file', async () => {
  get.mockResolvedValue({ data: { success: true, data: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', providerId: 'provider-1', authorId: 'admin-1',
    authorName: 'Mia Support', category: 'general', body: 'Other support context', pinned: false,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <NotesTab
        providerId="provider-1"
        exactNoteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('Audit Log remains the durable event record');
  expect(screen.getByRole('alert')).toHaveTextContent('No substitute note is shown');
  expect(screen.queryByText('Other support context')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact provider note evidence')).not.toBeInTheDocument();
});
