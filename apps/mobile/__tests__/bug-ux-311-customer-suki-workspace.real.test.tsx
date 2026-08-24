import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/suki.service', () => ({
  getMemberships: jest.fn().mockResolvedValue([
    {
      id: 'm-1',
      customerId: 'c-1',
      providerId: 'provider-1',
      providerName: 'Cebu Prime Care',
      tier: 'suki',
      totalBookings: 4,
      totalSpent: 500000,
      pointsBalance: 0,
      pointsMultiplier: 1.5,
      discount: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastBookingAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'm-2',
      customerId: 'c-1',
      providerId: 'provider-2',
      providerName: 'Mandaue Air Care',
      tier: 'regular',
      totalBookings: 2,
      totalSpent: 300000,
      pointsBalance: 0,
      pointsMultiplier: 1,
      discount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastBookingAt: null,
    },
  ]),
  getTiers: jest.fn().mockResolvedValue([
    { name: 'regular', minBookings: 0, pointsMultiplier: 1, discount: 0 },
    { name: 'suki', minBookings: 3, pointsMultiplier: 1.5, discount: 5 },
  ]),
  redeemPoints: jest.fn(),
}));

import SukiProsScreen from '../app/customer/suki-pros';

it('Bug UX-311 — customer Suki relationships form a wide provider grid with a truthful services link', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <SukiProsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop customer Suki workspace')).toBeTruthy();
  expect(screen.getByLabelText('Suki provider card grid').children).toHaveLength(2);
  fireEvent.click(
    screen.getByLabelText('View Cebu Prime Care services; provider assignment confirmed later'),
  );

  expect(mockPush).toHaveBeenCalledWith('/customer/provider/provider-1');
});
