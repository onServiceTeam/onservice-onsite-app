// HA-M3-212 (D38 Milestone 3, review gap): when response times cannot be
// loaded, the tab says "Response times could not be loaded" with the reason,
// never "No quote requests in this period", and Retry asks again and shows the
// figures.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { ResponseTimesTab } from '@/components/marketplace/ResponseTimesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-212: a failed Response times load shows an error with Retry, and Retry loads the figures', async () => {
  const row = { requests: 2, responded: 2, noResponse: 0, p50Minutes: 6, p90Minutes: 9, within30Pct: 100 };
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/response-times`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) throw new Error('Database timeout');
    return { data: { success: true, data: [{ categoryName: 'Aircon', ...row }], meta: { overall: row, groupBy: 'category' } } };
  });

  renderWithProviders(<ResponseTimesTab />);

  expect(await screen.findByText('Response times could not be loaded')).toBeInTheDocument();
  expect(screen.getByText('Database timeout')).toBeInTheDocument();
  expect(screen.queryByText('No quote requests in this period')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('response-time-row')).toHaveTextContent('Aircon');
  expect(calls).toBe(2);
});
