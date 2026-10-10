import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const apiGet = vi.hoisted(() => vi.fn((url: string, config?: { params?: { offset?: number } }) => {
  if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
  const offset = config?.params?.offset ?? 0;
  const indexes = offset === 0 ? Array.from({ length: 100 }, (_, index) => index + 1) : [101];
  return Promise.resolve({
    data: {
      data: {
        rows: indexes.map((index) => ({
          id: `consent-${index}`,
          userId: USER_ID,
          consentType: 'privacy_policy',
          version: `v${index}`,
          granted: true,
          grantedAt: '2026-09-02T00:00:00.000Z',
          revokedAt: null,
        })),
        total: 101,
      },
    },
  });
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1035 — exact consent evidence validates the user ID and pages beyond the first 100 records', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PrivacyWorkspacePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const input = screen.getByLabelText('User ID for consent lookup');
  fireEvent.change(input, { target: { value: 'not-a-user-id' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/complete user ID in UUID format/i);
  expect(apiGet.mock.calls.filter(([url]) => String(url).includes('/consent'))).toHaveLength(0);

  fireEvent.change(input, { target: { value: USER_ID } });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByText('Showing 1–100 of 101 records')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => {
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/admin/compliance/consent',
      expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, limit: 100, offset: 100 }) }),
    );
  });
  expect(await screen.findByText('v101')).toBeVisible();
  expect(screen.getByText('Showing 101–101 of 101 records')).toBeVisible();
});
