import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Schedule from '../app/provider/schedule';

jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: jest.fn().mockResolvedValue([]), setMySchedule: jest.fn(),
}));

it('Bug UX-1354 — weekly hours explain Manila-time matching and date overrides without promising search removal or booking changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Schedule /></QueryClientProvider>);
  expect(await screen.findByText('Set your regular hours for new job matching, in Manila time. Use 24-hour HH:MM, such as 08:00 to 17:00.')).toBeTruthy();
  expect(screen.getByText('Date overrides take priority over these weekly hours. Your profile may still appear in search outside these hours. Changing hours does not cancel or reschedule existing bookings.')).toBeTruthy();
  expect(screen.queryByText(/Customers will only see you as available during these hours/)).toBeNull();
  view.unmount(); client.clear();
});
