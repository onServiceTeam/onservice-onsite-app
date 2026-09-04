import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { USER_ID, apiGet } = vi.hoisted(() => ({
  USER_ID: '11111111-1111-4111-8111-111111111111',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1289 - failed consent lookup exposes an in-place retry for the same user', async () => {
  let consentCalls = 0;
  apiGet.mockImplementation((url: string) => {
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    consentCalls += 1;
    if (consentCalls === 1) return Promise.reject(new Error('consent source offline'));
    return Promise.resolve({ data: { data: { rows: [], total: 0 } } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PrivacyWorkspacePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('User ID for consent lookup'), { target: { value: USER_ID } });
  fireEvent.click(screen.getByRole('button', { name: /search consent records/i }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/consent source offline/i);
  fireEvent.click(within(alert).getByRole('button', { name: /retry consent lookup/i }));

  await waitFor(() => expect(consentCalls).toBe(2));
  expect(await screen.findByText('No consent records match this user ID.')).toBeVisible();
  expect(screen.queryByText(/consent source offline/i)).not.toBeInTheDocument();
});
