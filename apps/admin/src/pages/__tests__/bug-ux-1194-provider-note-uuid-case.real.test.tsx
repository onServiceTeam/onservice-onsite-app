import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const NOTE_ID = '11940000-0000-4abc-8def-000000001194';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { NotesTab } from '../ProviderDetailPage';

it('Bug UX-1194 - a valid uppercase note UUID resolves to the canonical exact support note', async () => {
  get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: NOTE_ID,
    providerId: 'provider-1',
    authorId: 'admin-1',
    authorName: 'Support Lead',
    category: 'quality',
    body: 'Canonical provider note',
    pinned: true,
    createdAt: '2026-09-03T13:13:00.000Z',
    updatedAt: '2026-09-03T13:13:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <NotesTab providerId="provider-1" exactNoteId={NOTE_ID.toUpperCase()} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical provider note')).toBeVisible();
  expect(screen.getByText('Canonical provider note').closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText(/No substitute note is shown/i)).not.toBeInTheDocument();
});
