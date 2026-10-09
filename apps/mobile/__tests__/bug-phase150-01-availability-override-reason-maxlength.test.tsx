import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]),
  addAvailabilityOverride: jest.fn(),
  removeAvailabilityOverride: jest.fn(),
  getAvailabilityStatus: jest.fn().mockResolvedValue(true),
  toggleAvailability: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import AvailabilitySettingsScreen from '../app/provider/availability';

it('Bug PHASE150-01 - provider availability reason input enforces the server 500-character limit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <AvailabilitySettingsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('No Date Overrides')).toBeTruthy());
  fireEvent.click(screen.getByText('+ Add'));
  expect(screen.getByLabelText('Override reason').getAttribute('maxlength')).toBe('500');
});
