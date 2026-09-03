import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/business.service', () => ({
  getBusinessAccounts: jest.fn().mockResolvedValue({
    items: [{
      id: 'business-1', companyName: 'Cebu Build Co', businessType: 'other',
      city: 'Cebu City', province: 'Cebu', status: 'active',
    }],
    total: 1,
  }),
}));

import BusinessAccountsScreen from '../app/customer/business';

it('Bug UX-972 — customers can discover a responsive company workspace without mixing it into personal bookings', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BusinessAccountsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Keep company services separate from personal bookings')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open Cebu Build Co company workspace' })).toBeTruthy();
  expect(screen.getByText('Open company records')).toBeTruthy();
});
