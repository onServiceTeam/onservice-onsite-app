import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const originalTimezone = process.env.TZ;
const mockGetCalendarData = jest.fn();
const mockCalendarData = {
  jobs: [{
    id: 'job-may-1',
    scheduledAt: '2026-04-30T22:30:00.000Z',
    serviceName: 'Early morning plumbing',
    customerName: 'Ana Cruz',
    status: 'confirmed',
    totalAmount: 125000,
    address: 'Lahug, Cebu City',
  }],
  overrides: [],
};

// Simulate a device configured for UTC. The business calendar must still
// place the instant in its canonical Asia/Manila service day.
process.env.TZ = 'UTC';
jest.useFakeTimers();
jest.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));

jest.mock('@/services/provider-api.service', () => ({
  getCalendarData: (...args: unknown[]) => mockGetCalendarData(...args),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    void queryFn();
    return {
      data: mockCalendarData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));

import ProviderCalendarScreen from '../app/provider/calendar';

afterAll(() => {
  jest.useRealTimers();
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

it('BUG-PHASE105-01 - provider calendar uses Manila month bounds and day grouping on a UTC device', () => {
  render(<ProviderCalendarScreen />);

  expect(mockGetCalendarData).toHaveBeenCalledWith(
    '2026-05-01T00:00:00+08:00',
    '2026-05-31T23:59:59+08:00',
  );

  const mayFirst = screen.getAllByRole('button', { name: '1' })[0];
  expect(mayFirst).toBeTruthy();
  fireEvent.click(mayFirst!);

  expect(screen.getByText('Early morning plumbing')).toBeTruthy();
  expect(screen.getByText('Ana Cruz')).toBeTruthy();
});
