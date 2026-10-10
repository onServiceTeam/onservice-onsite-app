import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import DataProtectionLogPage from '../DataProtectionLogPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current privacy queue query">{location.search}</output>;
}

it('Bug UX-1071 — a malformed privacy-case URL is rejected locally without losing valid queue filters', async () => {
  apiGet.mockResolvedValue({ data: { data: { rows: [], total: 0 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/data-protection-log?status=received&dsrId=not-a-uuid']}>
        <LocationEvidence />
        <DataProtectionLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid privacy case link')).toBeVisible();
  expect(apiGet).toHaveBeenCalledTimes(1);
  expect(apiGet).toHaveBeenCalledWith(expect.stringMatching(/\/compliance\/dsr\?/));

  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid case link' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Current privacy queue query')).toHaveTextContent('?status=received');
  });
  expect(screen.getByLabelText('Current privacy queue query')).not.toHaveTextContent('dsrId');
  expect(apiGet).toHaveBeenCalledTimes(1);
});
