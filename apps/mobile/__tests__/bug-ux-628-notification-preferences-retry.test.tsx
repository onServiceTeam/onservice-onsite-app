import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRefetchPreferences = jest.fn().mockRejectedValue(new Error('settings unavailable'));

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/notification.service', () => ({
  getNotificationPreferences: () => mockRefetchPreferences(),
  updateNotificationPreferences: jest.fn(),
}));

import CustomerNotificationSettingsScreen from '../app/customer/notification-settings';

it('Bug UX-628 — failed notification preferences provide an explicit retry without enabling stale controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <CustomerNotificationSettingsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Settings unavailable')).toBeTruthy();
  expect(screen.getByText('Try Again')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enable All' }).hasAttribute('disabled')).toBe(true);
});
