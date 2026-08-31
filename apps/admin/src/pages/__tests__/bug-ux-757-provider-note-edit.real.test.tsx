import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { NotesTab } from '../ProviderDetailPage';

it('Bug UX-757 — Provider 360 lets an authorized operator edit a bounded internal note through the provider-scoped route', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: 'note-1', providerId: 'provider-1', authorId: 'admin-1', authorName: 'Mia Support',
    category: 'general', body: 'Original support context', pinned: false,
    createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
  }] } });
  apiMocks.patch.mockResolvedValueOnce({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><NotesTab providerId="provider-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
  const editor = screen.getByRole('textbox', { name: 'Edit note by Mia Support' });
  expect(editor).toHaveAttribute('maxlength', '5000');
  fireEvent.change(editor, { target: { value: 'Updated support context after provider callback.' } });
  fireEvent.change(screen.getByLabelText('Edit note category'), { target: { value: 'quality' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/notes/note-1',
    { body: 'Updated support context after provider callback.', category: 'quality' },
  ));
});
