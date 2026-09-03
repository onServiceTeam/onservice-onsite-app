import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { NotesTab } from '../ProviderDetailPage';

it('Bug UX-1150 — an exact Provider 360 note link selects only the provider-owned active note with that canonical ID', async () => {
  get.mockResolvedValue({ data: { success: true, data: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', providerId: 'provider-1', authorId: 'admin-2',
      authorName: 'Other Admin', category: 'general', body: 'Other support context', pinned: false,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: TARGET_ID, providerId: 'provider-1', authorId: 'admin-1', authorName: 'Mia Support',
      category: 'quality', body: 'Exact support context', pinned: true,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <NotesTab providerId="provider-1" exactNoteId={TARGET_ID} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact provider note evidence')).toBeVisible();
  const selectedBody = screen.getByText('Exact support context');
  expect(selectedBody.closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText('Other support context')).not.toBeInTheDocument();
});
