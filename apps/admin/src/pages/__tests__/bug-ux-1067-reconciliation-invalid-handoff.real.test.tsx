import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1067 - a malformed reconciliation handoff fails closed before an API request', async () => {
  vi.mocked(api.get).mockReset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=reconciliation&snapshotId=not-a-uuid']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid reconciliation snapshot link')).toBeVisible();
  expect(screen.getByText(/must be a complete UUID/i)).toBeVisible();
  expect(api.get).not.toHaveBeenCalled();
});
