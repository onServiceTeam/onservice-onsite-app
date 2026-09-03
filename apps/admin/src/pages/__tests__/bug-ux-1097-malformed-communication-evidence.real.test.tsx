import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const MESSAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-1097 - malformed communication evidence identifiers are rejected before an exact thread request', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 0 } } };
    }
    if (url === '/api/v1/admin/conversations/queue') {
      return { data: { messages: [], total: 0 } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/communications?conversationId=bad-id&messageId=${MESSAGE_ID}`]}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('The conversation ID must be a complete UUID.');
  expect(apiMocks.get).not.toHaveBeenCalledWith(expect.stringContaining('bad-id'));
});
