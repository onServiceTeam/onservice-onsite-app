import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { deleteRequest, get, patch, post } = vi.hoisted(() => ({
  deleteRequest: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { delete: deleteRequest, get, patch, post },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

get.mockResolvedValue({
  data: {
    success: true,
    data: [
      {
        id: 'note-1',
        providerId: 'provider-1',
        authorId: 'admin-1',
        authorName: 'Support Admin',
        category: 'general',
        body: 'Customer called about access instructions.',
        pinned: false,
        createdAt: '2026-08-30T01:00:00.000Z',
        updatedAt: '2026-08-30T01:00:00.000Z',
      },
    ],
  },
});
deleteRequest.mockResolvedValue({ data: { success: true } });

import { NotesTab } from '../ProviderDetailPage';

it('Bug UX-429 — deleting a provider note requires an in-app reason and sends it to the audit-backed API', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <NotesTab providerId="provider-1" />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Delete internal note?' })).toBeTruthy();
  const deleteButton = screen.getByRole('button', { name: 'Delete note' });
  expect(deleteButton).toBeDisabled();

  fireEvent.change(screen.getByRole('textbox', { name: 'Deletion reason' }), {
    target: { value: 'Duplicate note entered on the wrong provider.' },
  });
  fireEvent.click(deleteButton);

  await waitFor(() =>
    expect(deleteRequest).toHaveBeenCalledWith(
      '/api/v1/admin/providers/provider-1/notes/note-1',
      { body: { reason: 'Duplicate note entered on the wrong provider.' } },
    ),
  );
  confirmSpy.mockRestore();
});
