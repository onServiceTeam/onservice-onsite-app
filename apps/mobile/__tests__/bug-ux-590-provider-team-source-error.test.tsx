import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMyStaff } from '@/services/provider-staff.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockRejectedValue(new Error('team unavailable')),
  inviteStaff: jest.fn(),
  removeStaff: jest.fn(),
  submitStaffForReview: jest.fn(),
  staffStatusLabel: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({ getProviderBookings: jest.fn() }));

import ProviderTeamScreen from '../app/provider/team';

it('Bug UX-590 — a failed team roster is not presented as zero members or zero active assignments', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderTeamScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Team members \(—\)/)).toBeTruthy();
  expect(screen.getByText(/couldn't load your team/i)).toBeTruthy();
  expect(screen.queryByText('No active team assignments')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getMyStaff).toHaveBeenCalledTimes(2));
});
