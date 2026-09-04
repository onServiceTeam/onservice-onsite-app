import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import { IntakeFieldsManager } from '../IntakeFieldsManager';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('intake source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: [] } });
});

it('Bug UX-1292 - a failed intake-field read offers an in-place retry instead of an empty configuration state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <IntakeFieldsManager subcategoryId="service-1" subcategoryName="Aircon cleaning" />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Customer question configuration cannot be verified.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry intake fields' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No intake fields yet.')).toBeInTheDocument();
});
