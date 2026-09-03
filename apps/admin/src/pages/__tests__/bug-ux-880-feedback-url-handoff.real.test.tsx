import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import FeedbackPage from '../FeedbackPage';
import { feedbackRecord } from './feedback-test-fixtures';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().search}</output>;
}

beforeEach(() => {
  const queueRecord = { ...feedbackRecord, id: 'feedback-1', testerName: 'Queue tester', status: 'done' as const };
  const linkedRecord = { ...feedbackRecord, id: 'feedback-2', testerName: 'Linked tester', status: 'done' as const };
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/feedback') {
      return {
        data: {
          success: true,
          data: {
            submissions: [{ ...queueRecord, payload: {} }],
            total: 50,
            page: 2,
            pageSize: 25,
            counts: { new: 0, triaged: 0, done: 50, dismissed: 0 },
          },
        },
      } as never;
    }
    if (url === '/api/v1/admin/feedback/feedback-1') {
      return { data: { success: true, data: queueRecord } } as never;
    }
    if (url === '/api/v1/admin/feedback/feedback-2') {
      return { data: { success: true, data: linkedRecord } } as never;
    }
    if (url.endsWith('/history')) {
      return { data: { success: true, data: { entries: [] } } } as never;
    }
    if (url === '/api/v1/support-tickets/agents') {
      return { data: { success: true, data: [] } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-880 — tester-feedback URLs restore the exact queue and linked case for operator handoff', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/feedback?status=done&area=provider&search=proof&page=2&feedbackId=feedback-2']}>
        <FeedbackPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Linked tester' })).toBeInTheDocument();
  expect(screen.getByText(/opened from a saved link/i)).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback', expect.objectContaining({
    params: expect.objectContaining({ status: 'done', area: 'provider', search: 'proof', page: 2, pageSize: 25 }),
  })));
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/feedback/feedback-2');
  expect(screen.getByRole('combobox', { name: 'Filter tester feedback by app area' })).toHaveValue('provider');
  expect(screen.getByRole('textbox', { name: 'Search tester feedback' })).toHaveValue('proof');
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Queue tester/i }));
  await waitFor(() => {
    const location = screen.getByTestId('location').textContent ?? '';
    expect(location).toContain('status=done');
    expect(location).toContain('area=provider');
    expect(location).toContain('search=proof');
    expect(location).toContain('page=2');
    expect(location).toContain('feedbackId=feedback-1');
  });
});
