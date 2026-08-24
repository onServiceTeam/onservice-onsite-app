import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

import NotificationSettingsScreen from '../app/customer/notification-settings';

it('Bug UX-144 — a failed preference load cannot overwrite saved choices with local defaults', async () => {
  jest.mocked(api.get).mockRejectedValue(new Error('offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationSettingsScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Retry before making changes/i)).toBeTruthy();
  expect(screen.getByText('Enable All').closest('button')).toHaveProperty('disabled', true);
  expect(screen.getByText('Essentials Only').closest('button')).toHaveProperty('disabled', true);
  expect(screen.queryByText('Save Preferences')).toBeNull();
});
