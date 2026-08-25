import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        data: [{
          id: 'booking-1',
          status: 'matched',
          serviceName: 'Aircon Cleaning',
          providerName: 'Cebu Cooling',
          scheduledAt: '2026-08-28T01:00:00.000Z',
          totalAmount: 125000,
        }],
        meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
      },
    }),
  },
}));

import BookingsScreen from '../app/(tabs)/bookings';

it('Bug UX-375 — phone bookings keeps shortcuts readable and opens a booking through the canonical detail route', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingsScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Booking shortcuts')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open recurring bookings' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open projects' })).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Open Aircon Cleaning booking' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/booking-1');
});
