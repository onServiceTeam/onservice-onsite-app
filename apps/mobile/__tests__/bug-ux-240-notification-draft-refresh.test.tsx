import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const ReactModule = require('react') as typeof React;
  return {
    ...actual,
    Switch: ({
      value,
      onValueChange,
      accessibilityLabel,
      disabled,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      accessibilityLabel?: string;
      disabled?: boolean;
    }) => ReactModule.createElement('input', {
      type: 'checkbox',
      checked: value,
      disabled,
      'aria-label': accessibilityLabel,
      onChange: () => onValueChange(!value),
    }),
  };
});
jest.mock('@/components/icons', () => ({ ChevronLeft: () => null }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

import NotificationSettingsScreen from '../app/customer/notification-settings';

it('Bug UX-240 — a background preference refresh does not erase an unsaved notification choice', async () => {
  const stored = {
    bookingUpdates: true,
    providerActivity: true,
    paymentAlerts: true,
    messages: true,
    sukiRewards: true,
    reminders: true,
    system: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    quietHoursTimezone: 'Asia/Manila',
  };
  jest.mocked(api.get).mockResolvedValue({ data: { success: true, data: stored } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationSettingsScreen />
    </QueryClientProvider>,
  );

  const messages = await screen.findByRole('checkbox', { name: 'Messages alerts' });
  fireEvent.click(messages);
  expect(messages).toHaveProperty('checked', false);

  act(() => {
    client.setQueryData(['notification-preferences'], { ...stored, reminders: false });
  });

  await waitFor(() => expect(messages).toHaveProperty('checked', false));
  expect(screen.getByRole('button', { name: 'Save Preferences' })).toBeTruthy();
});
