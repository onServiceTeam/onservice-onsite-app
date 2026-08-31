import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import ConsentVersionsPage from '../ConsentVersionsPage';

it('Bug UX-813 — unavailable consent evidence fails visibly and gives the DPO a working retry', async () => {
  apiGet.mockRejectedValue(new Error('Consent evidence source is offline.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><ConsentVersionsPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('Consent evidence unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry consent evidence' }));
  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
});
