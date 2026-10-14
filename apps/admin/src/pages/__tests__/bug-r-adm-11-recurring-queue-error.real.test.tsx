import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: apiPost },
  getErrorMessage: (error: Error) => error.message,
}));

import RecurringPage from '../RecurringPage';

const series = {
  id: '11111111-0011-4011-8011-111111111111', customerId: 'customer-r-adm-11', providerId: null,
  categoryId: 'category-r-adm-11', originalBookingId: null, frequency: 'weekly', preferredDayName: 'Monday',
  preferredTime: '09:00', city: 'Cebu City', province: 'Cebu', totalAmount: 120000, status: 'active',
  nextBookingDate: '2026-10-19', totalInstances: 3, createdAt: '2026-09-01', customerName: 'Ana Reyes',
  providerName: null, categoryName: 'Cleaning', subcategoryName: 'Deep Cleaning', failedInstances: 0,
  openSupportTickets: 0,
};

const queueResponse = {
  data: {
    success: true,
    data: [series],
    summary: { matchingSeries: 7, activeSeries: 5, seriesWithFailedInstances: 2, openSupportTickets: 4 },
    pagination: { page: 1, pageSize: 20, total: 7, totalPages: 1 },
  },
};

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/recurring']}><RecurringPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({ data: { success: true } });
});

it('Bug R-ADM-11 — a failed recurring queue read shows the unavailable error with its reason and a Retry button', async () => {
  apiGet.mockRejectedValue(new Error('Recurring queue offline.'));
  renderPage();

  const heading = await screen.findByRole('heading', { name: 'Recurring booking queue unavailable' });
  const alert = heading.closest('[role="alert"]') as HTMLElement;
  expect(alert).not.toBeNull();
  expect(within(alert).getByText('Recurring queue offline.')).toBeInTheDocument();
  expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('Bug R-ADM-11 — a failed recurring queue read shows no empty queue message and no zero summary counts', async () => {
  apiGet.mockRejectedValue(new Error('Recurring queue offline.'));
  renderPage();

  await screen.findByRole('heading', { name: 'Recurring booking queue unavailable' });
  expect(screen.queryByText('No recurring series match')).not.toBeInTheDocument();
  expect(screen.queryByText('Customer recurring schedules will appear here.')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Recurring booking operations summary')).not.toBeInTheDocument();
  for (const label of ['Matching series', 'Active series', 'Series with failed schedules', 'Open linked support cases']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.queryByText('0')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Recurring booking operations queue')).not.toBeInTheDocument();
});

it('Bug R-ADM-11 — Retry on a failed recurring queue asks the server again and shows the real queue and counts', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('Recurring queue offline.'))
    .mockResolvedValue(queueResponse);
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  const queue = await screen.findByLabelText('Recurring booking operations queue');
  expect(within(queue).getByText('Ana Reyes')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Recurring booking queue unavailable' })).not.toBeInTheDocument();
  const summary = screen.getByLabelText('Recurring booking operations summary');
  expect(within(summary).getByText('7')).toBeInTheDocument();
  expect(within(summary).getByText('5')).toBeInTheDocument();
});

it('Bug R-ADM-11 — when the recurring queue fails to reload after a cancellation, the old summary counts are no longer shown', async () => {
  apiGet
    .mockResolvedValueOnce(queueResponse)
    .mockRejectedValue(new Error('Recurring queue offline.'));
  renderPage();

  const summaryBefore = await screen.findByLabelText('Recurring booking operations summary');
  expect(within(summaryBefore).getByText('7')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel future series' }));
  fireEvent.change(screen.getByLabelText('Operator reason *'), { target: { value: 'Customer asked us to stop the weekly visits.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

  expect(await screen.findByRole('heading', { name: 'Recurring booking queue unavailable' })).toBeInTheDocument();
  expect(apiPost).toHaveBeenCalledTimes(1);
  expect(apiGet).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('Recurring booking operations summary')).not.toBeInTheDocument();
  for (const label of ['Matching series', 'Active series', 'Series with failed schedules', 'Open linked support cases']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});

it('Bug R-ADM-11 — when the recurring queue fails to reload after a cancellation, the old result total under the queue is no longer shown', async () => {
  const multiPageQueueResponse = {
    data: {
      ...queueResponse.data,
      summary: { matchingSeries: 47, activeSeries: 40, seriesWithFailedInstances: 2, openSupportTickets: 4 },
      pagination: { page: 1, pageSize: 20, total: 47, totalPages: 3 },
    },
  };
  apiGet
    .mockResolvedValueOnce(multiPageQueueResponse)
    .mockRejectedValue(new Error('Recurring queue offline.'));
  renderPage();
  const resultTotal = (): HTMLElement | null => screen.queryByText(
    (_content, element) => element?.tagName === 'P' && element.textContent === 'Showing 1 to 20 of 47 results',
  );

  await screen.findByLabelText('Recurring booking operations queue');
  expect(resultTotal()).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel future series' }));
  fireEvent.change(screen.getByLabelText('Operator reason *'), { target: { value: 'Customer asked us to stop the weekly visits.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));

  expect(await screen.findByRole('heading', { name: 'Recurring booking queue unavailable' })).toBeInTheDocument();
  expect(apiPost).toHaveBeenCalledTimes(1);
  expect(apiGet).toHaveBeenCalledTimes(2);
  expect(resultTotal()).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
});
