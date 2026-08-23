import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-paid' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-paid',
    bookingType: 'fixed_price',
    status: 'paid',
    servicePrice: 120_000,
    address: '88 Banilad Road',
    city: 'Mandaue City',
    scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Paolo Garcia',
    serviceName: 'Aircon Cleaning',
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('Bug UX-079 — a successful Start Navigation transition opens directions immediately', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProviderJobDetailScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByLabelText('Start Navigation'));
  const confirmButtons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  await act(async () => {
    confirmButtons.find((button) => button.text === 'Yes')?.onPress?.();
  });

  await waitFor(() => {
    expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-paid/navigate');
  });
});
