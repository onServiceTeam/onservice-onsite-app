import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1024,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/suki.service', () => ({
  getProviderSukiCustomers: jest.fn().mockResolvedValue([
    {
      id: 'suki-1',
      customerId: 'customer-1',
      customerName: 'Ana Customer',
      totalBookings: 5,
      totalSpent: 700000,
      tier: 'suki',
      discount: 5,
      lastBookingAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'suki-2',
      customerId: 'customer-2',
      customerName: 'Ben Customer',
      totalBookings: 3,
      totalSpent: 420000,
      tier: 'regular',
      discount: 0,
      lastBookingAt: null,
    },
  ]),
}));

import ProviderSukiCustomersScreen from '../app/provider/suki-customers';

it('Bug UX-312 — provider Suki customers use a wide CRM grid and open the canonical client record', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderSukiCustomersScreen />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByLabelText('Tablet and desktop provider Suki CRM workspace'),
  ).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Open Ana Customer client record'));

  expect(mockPush).toHaveBeenCalledWith('/provider/clients/customer-1');
});
