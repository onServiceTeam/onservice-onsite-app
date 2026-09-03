import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current support filters">{location.search}</output>;
}

it('Bug UX-1219 - malformed support identifiers fail closed until only those link fields are removed', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/support-tickets/summary') return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    if (url === '/api/v1/support-tickets/agents') return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/api/v1/support-tickets?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/support-tickets?ticketId=bad-ticket&bookingId=bad-booking&status=open&page=3']}>
        <LocationEvidence />
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid support workspace link')).toBeVisible();
  expect(apiGet.mock.calls.some(([url]) => String(url).startsWith('/api/v1/support-tickets?'))).toBe(false);
  expect(apiGet.mock.calls.some(([url]) => String(url).includes('bad-ticket') || String(url).includes('bad-booking'))).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid support links' }));
  const location = screen.getByLabelText('Current support filters');
  expect(location).toHaveTextContent('status=open');
  expect(location).toHaveTextContent('page=3');
  expect(location).not.toHaveTextContent('ticketId');
  expect(location).not.toHaveTextContent('bookingId');
});
