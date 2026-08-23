import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: jest.fn().mockRejectedValue(new Error('network unavailable')),
  setMySchedule: jest.fn(),
}));

import ScheduleScreen from '../app/provider/schedule';

it('Bug UX-077 — a schedule load failure cannot expose editable fallback hours', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ScheduleScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/editing is locked so the fallback hours cannot overwrite/i)).toBeTruthy();
  expect(screen.queryByText('Monday')).toBeNull();
  expect(screen.queryByLabelText('Save Schedule')).toBeNull();
  expect(screen.getByText('Try Again')).toBeTruthy();
});
