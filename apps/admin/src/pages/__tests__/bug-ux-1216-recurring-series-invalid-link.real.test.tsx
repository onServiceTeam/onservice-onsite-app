import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import RecurringPage from '../RecurringPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current recurring filters">{location.search}</output>;
}

it('Bug UX-1216 - a malformed recurring series link is rejected without losing queue filters', async () => {
  apiGet.mockResolvedValue({ data: {
    success: true,
    data: [],
    summary: { matchingSeries: 0, activeSeries: 0, seriesWithFailedInstances: 0, openSupportTickets: 0 },
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/recurring?seriesId=not-a-uuid&status=active&search=Cebu']}>
        <LocationEvidence />
        <RecurringPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid recurring series link')).toBeVisible();
  expect(apiGet).toHaveBeenCalledTimes(1);
  expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/recurring', {
    params: { page: 1, pageSize: 20, search: 'Cebu', status: 'active' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid series link' }));
  const location = screen.getByLabelText('Current recurring filters');
  expect(location).toHaveTextContent('status=active');
  expect(location).toHaveTextContent('search=Cebu');
  expect(location).not.toHaveTextContent('seriesId');
});
