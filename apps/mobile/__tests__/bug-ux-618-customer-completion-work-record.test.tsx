import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'completed_by_provider', providerName: 'Santos Home Services',
    serviceName: 'Aircon deep cleaning',
  }),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { patch: jest.fn() } }));

import JobCompletionScreen from '../app/customer/booking/complete';

it('Bug UX-618 — completion links the customer to the canonical work record before the decision', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobCompletionScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Santos Home Services has marked Aircon deep cleaning as complete/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review work record' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/booking-1');
});
