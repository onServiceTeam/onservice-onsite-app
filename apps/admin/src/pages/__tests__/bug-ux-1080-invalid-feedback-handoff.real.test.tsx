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

import FeedbackPage from '../FeedbackPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current invalid feedback query">{location.search}</output>;
}

it('Bug UX-1080 - malformed saved feedback state never substitutes the first queue submission', async () => {
  const queueId = '10801080-1080-4080-8080-108010801080';
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/feedback') {
      return Promise.resolve({ data: { success: true, data: {
        submissions: [{
          id: queueId,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          testerName: 'First queue tester',
          testerContact: null,
          contactMasked: true,
          piiMasked: true,
          role: 'customer',
          device: 'Tablet',
          areas: ['customer'],
          nps: null,
          summary: 'This is a different submission.',
          itemCount: 1,
          payload: {},
          status: 'done',
          assignedAdminId: null,
          assignedAdminName: null,
          triageNote: null,
        }],
        total: 1,
        page: 1,
        pageSize: 25,
        counts: { new: 0, triaged: 0, done: 1, dismissed: 0 },
      } } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/feedback?status=done&feedbackId=%2Finvalid']}>
        <FeedbackPage />
        <LocationEvidence />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('The saved feedback link is invalid.');
  expect(screen.queryByRole('heading', { name: 'First queue tester' })).not.toBeInTheDocument();
  expect(apiGet).not.toHaveBeenCalledWith(`/api/v1/admin/feedback/${queueId}`);
  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid feedback link' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Current invalid feedback query')).toHaveTextContent('?status=done&feedbackId=10801080-1080-4080-8080-108010801080');
  });
});
