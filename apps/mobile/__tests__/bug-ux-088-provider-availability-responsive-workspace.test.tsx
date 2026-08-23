import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]),
  addAvailabilityOverride: jest.fn(),
  removeAvailabilityOverride: jest.fn(),
  getAvailabilityStatus: jest.fn().mockResolvedValue(true),
  toggleAvailability: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import AvailabilitySettingsScreen from '../app/provider/availability';

it('Bug UX-088 — provider availability uses a bounded two-column operations workspace on wide browsers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <AvailabilitySettingsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('No Date Overrides'));
  expect(container.querySelector(
    '[aria-label="Tablet and desktop availability workspace"]',
  )).not.toBeNull();
  expect(container.textContent).toContain('Weekly schedule');
  expect(container.textContent).toContain('Date Overrides');
});
