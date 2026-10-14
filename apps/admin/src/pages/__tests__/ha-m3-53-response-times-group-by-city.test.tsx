// HA-M3-53 (D38 Milestone 3): pressing "By city" on Response times asks the
// server for groupBy=city and the table then lists cities.
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

it('HA-M3-53: the By city toggle requests groupBy=city and shows the cities', async () => {
  apiMocks.get.mockImplementation(async (url: string, init?: { params?: { groupBy?: string } }) => {
    if (url !== `${MARKETPLACE}/response-times`) throw new Error(`Unexpected GET ${url}`);
    const byCity = init?.params?.groupBy === 'city';
    const row = { requests: 2, responded: 2, noResponse: 0, p50Minutes: 6, p90Minutes: 9, within30Pct: 100 };
    return {
      data: {
        success: true,
        data: byCity ? [{ city: 'Mandaue', ...row }] : [{ categoryName: 'Aircon', ...row }],
        meta: { overall: row, from: '2026-09-15', to: '2026-10-14', groupBy: byCity ? 'city' : 'category' },
      },
    };
  });

  renderWithProviders(<ResponseTimesTab />);

  expect(await screen.findByText('Aircon')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'By category' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'By city' }));

  expect(await screen.findByText('Mandaue')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'City' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'By city' })).toHaveAttribute('aria-pressed', 'true');
  expect(apiMocks.get).toHaveBeenLastCalledWith(`${MARKETPLACE}/response-times`, {
    params: { from: undefined, to: undefined, groupBy: 'city' },
  });
});
