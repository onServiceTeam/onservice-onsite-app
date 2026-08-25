import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([{
    id: 'staff-1',
    userId: 'user-1',
    userName: 'Jun-Jun M.',
    roleTitle: 'Master Plumber',
    status: 'approved',
    invitePhone: '+639171234567',
    inviteEmail: null,
    adminDecisionReason: null,
    isAssignable: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    performance: { totalJobs: 12, totalReviews: 8, averageRating: 4.8 },
  }]),
  inviteStaff: jest.fn(),
  removeStaff: jest.fn(),
  submitStaffForReview: jest.fn(),
  staffStatusLabel: () => 'Approved',
}));
jest.mock('@/services/provider-api.service', () => ({
  getProviderBookings: jest.fn().mockResolvedValue({
    bookings: [{
      id: 'booking-1',
      performerStaffId: 'staff-1',
      status: 'in_progress',
      scheduledAt: '2026-08-25T08:00:00.000Z',
      serviceName: 'Emergency Pipe Leak Repair',
      address: '88 Banilad Road',
      barangay: 'Banilad',
      city: 'Mandaue',
    }],
  }),
}));

import ProviderTeamScreen from '../app/provider/team';

it('Bug UX-357 — provider team connects approved technicians to their active job assignments and canonical job records', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderTeamScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('Assigned to Jun-Jun M.')).toBeTruthy());
  const assignment = screen.getByRole('button', { name: 'View Emergency Pipe Leak Repair assignment' });
  expect(assignment.textContent).toContain('88 Banilad Road');
  fireEvent.click(assignment);
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-1');
});
