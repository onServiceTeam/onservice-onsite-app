import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ACTOR_ID = '12140000-abcd-4abc-8def-000000001214';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current canonical actor filter">{location.search}</output>;
}

it('Bug UX-1214 - a submitted uppercase audit actor UUID becomes a canonical server filter', async () => {
  apiMocks.get.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('Filter audit log by actor ID'), {
    target: { value: ACTOR_ID.toUpperCase() },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  await waitFor(() => {
    expect(apiMocks.get).toHaveBeenCalledWith(
      '/api/v1/admin/audit-log',
      { params: expect.objectContaining({ userId: ACTOR_ID }) },
    );
  });
  expect(screen.getByLabelText('Current canonical actor filter')).toHaveTextContent(
    `?userId=${ACTOR_ID}`,
  );
});
