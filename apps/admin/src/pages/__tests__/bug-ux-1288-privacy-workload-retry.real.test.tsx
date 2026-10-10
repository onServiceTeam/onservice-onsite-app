import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1288 - privacy workload failure exposes a retry that refreshes the counts', async () => {
  let calls = 0;
  apiGet.mockImplementation((url: string) => {
    calls += 1;
    if (url.includes('dsr-alerts') && calls === 1) return Promise.reject(new Error('privacy source offline'));
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PrivacyWorkspacePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/counts are not zero/i);
  fireEvent.click(within(alert).getByRole('button', { name: /retry privacy workload/i }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/compliance/dsr-alerts'));
  expect(within(await screen.findByLabelText('Upcoming internal target workload')).getByText('0')).toBeVisible();
  expect(screen.queryByText(/counts are not zero/i)).not.toBeInTheDocument();
});
