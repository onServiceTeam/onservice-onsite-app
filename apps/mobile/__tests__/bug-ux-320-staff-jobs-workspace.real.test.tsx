import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Mia' },
    logout: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('@/services/provider-staff.service', () => ({
  getMyAssignedJobs: jest.fn().mockResolvedValue([{
    id: 'booking-1',
    status: 'in_progress',
    scheduledAt: '2026-08-25T01:00:00.000Z',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    serviceName: 'Turnover Cleaning',
    customerName: 'Ana Customer',
    providerBusinessName: 'Cebu Care Team',
  }]),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import StaffJobsScreen from '../app/staff/jobs';

it('Bug UX-320 — staff jobs use a bounded wide field workspace with assignment and provider-business context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <StaffJobsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop assigned field work overview')).toBeTruthy();
  expect(screen.getByLabelText('Tablet and desktop assigned jobs grid')).toBeTruthy();
  expect(await screen.findByText('Cebu Care Team')).toBeTruthy();
  expect(screen.getByText('Active now')).toBeTruthy();
  expect(screen.getByText('Turnover Cleaning')).toBeTruthy();
});
