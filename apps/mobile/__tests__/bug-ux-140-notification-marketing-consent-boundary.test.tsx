import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import NotificationSettingsScreen from '../app/customer/notification-settings';

it('Bug UX-140 — ordinary push preferences cannot falsely opt a customer into marketing without the separate recorded consent flow', async () => {
  jest.mocked(api.get).mockResolvedValue({
    data: { data: { bookingUpdates: true, providerActivity: true, paymentAlerts: true, messages: true, promotions: false, sukiRewards: true, reminders: true, system: true } },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationSettingsScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide notification preference workspace')).toBeTruthy();
  expect(screen.getByText('Marketing consent is separate')).toBeTruthy();
  expect(screen.getByText(/require recorded consent/i)).toBeTruthy();
  expect(screen.queryByText('Promotions & Offers')).toBeNull();
});
