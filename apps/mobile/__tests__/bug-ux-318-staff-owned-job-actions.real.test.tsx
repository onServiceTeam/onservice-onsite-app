import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-12345678' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-12345678',
    status: 'in_progress',
    serviceName: 'Turnover Cleaning',
    customerName: 'Ana Customer',
    scheduledAt: '2026-08-25T01:00:00.000Z',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    description: 'Clean after construction.',
  }),
}));
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: jest.fn().mockResolvedValue({ stage: 'work_in_progress' }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { sections: [] } } }),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));
jest.mock('@/services/booking-photo.service', () => ({ uploadBookingPhoto: jest.fn() }));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/components/booking/ProofSummaryCard', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => react.createElement('div', null, 'Shared work record'),
  };
});
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import StaffJobDetailScreen from '../app/staff/job/[id]';
import StaffJobChecklistScreen from '../app/staff/job/[id]/checklist';

it('Bug UX-318 — assigned staff stay in staff-owned checklist and booking-support routes instead of dead provider-owner routes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <StaffJobDetailScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop assigned job record workspace')).toBeTruthy();

  fireEvent.click(screen.getByText('Open Checklist'));
  expect(mockPush).toHaveBeenCalledWith('/staff/job/booking-12345678/checklist');

  fireEvent.click(screen.getByText('Get Booking Support'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      bookingId: 'booking-12345678',
      type: 'booking_issue',
      subject: 'Help with assigned job booking-',
    },
  });
  expect(screen.queryByText('Chat with Customer')).toBeNull();

  cleanup();
  const checklistClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={checklistClient}>
      <StaffJobChecklistScreen />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText('Tablet and desktop team member checklist workspace')).toBeTruthy();
  fireEvent.click(screen.getByText('Save & Continue'));
  expect(mockPush).toHaveBeenCalledWith('/staff/job/booking-12345678/complete');
});
