// HA-M3-201 (D38 Milestone 3, review fix): after "By city" is pressed on
// Response times, the category figures stay on screen until the city figures
// arrive. Until then they must keep their category names and the "Category"
// heading; they must never be relabelled as cities ("No city"), which would
// show Aircon's numbers as a city's. The city request is held open on purpose.
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

it('HA-M3-201: while the city figures load, the category rows keep their category names, never "No city"', async () => {
  const row = { requests: 6, responded: 5, noResponse: 1, p50Minutes: 9.5, p90Minutes: 42, within30Pct: 66.7 };
  let releaseCity: (value: unknown) => void = () => undefined;
  apiMocks.get.mockImplementation((url: string, init?: { params?: { groupBy?: string } }) => {
    if (url !== `${MARKETPLACE}/response-times`) throw new Error(`Unexpected GET ${url}`);
    if (init?.params?.groupBy === 'city') {
      return new Promise((resolve) => {
        releaseCity = resolve;
      });
    }
    return Promise.resolve({
      data: {
        success: true,
        data: [{ categoryName: 'Aircon', ...row }],
        meta: { overall: row, from: '2026-09-15', to: '2026-10-14', groupBy: 'category' },
      },
    });
  });

  renderWithProviders(<ResponseTimesTab />);
  expect(await screen.findByText('Aircon')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'By city' }));
  await vi.waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));

  const rows = screen.getAllByTestId('response-time-row');
  expect(rows.map((item) => item.firstElementChild?.textContent)).toEqual(['Aircon']);
  expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
  expect(screen.queryByText('No city')).not.toBeInTheDocument();

  releaseCity({
    data: {
      success: true,
      data: [{ city: 'Mandaue', ...row }],
      meta: { overall: row, from: '2026-09-15', to: '2026-10-14', groupBy: 'city' },
    },
  });
  expect(await screen.findByText('Mandaue')).toBeInTheDocument();
});
