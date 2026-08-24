import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

import ProviderNotificationSettingsScreen from '../app/provider/notification-settings';

it('Bug UX-238 — providers can edit server-backed quiet hours in the wide preference workspace', async () => {
  const response = {
    bookingUpdates: true,
    providerActivity: true,
    paymentAlerts: true,
    messages: true,
    promotions: false,
    sukiRewards: true,
    reminders: true,
    system: true,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    quietHoursTimezone: 'Asia/Manila',
    marketingConsentAcknowledgedAt: '2026-08-01T00:00:00.000Z',
    marketingConsentVersion: 3,
  };
  jest.mocked(api.get).mockResolvedValue({ data: { success: true, data: response } } as never);
  jest.mocked(api.put).mockImplementation(async (_url, payload) => ({
    data: { success: true, data: payload },
  } as never));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderNotificationSettingsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Wide provider notification preference workspace')).toBeTruthy();
  expect(screen.getByText('Job and booking updates')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '21:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

  await waitFor(() => {
    expect(api.put).toHaveBeenCalledWith(
      '/api/v1/notifications/preferences',
      expect.objectContaining({ quietHoursEnabled: true, quietHoursStart: '21:30', quietHoursEnd: '07:00' }),
    );
  });
  const savedPayload = jest.mocked(api.put).mock.calls[0]?.[1] as Record<string, unknown>;
  expect(savedPayload).not.toHaveProperty('marketingConsentAcknowledgedAt');
  expect(savedPayload).not.toHaveProperty('marketingConsentVersion');
});
