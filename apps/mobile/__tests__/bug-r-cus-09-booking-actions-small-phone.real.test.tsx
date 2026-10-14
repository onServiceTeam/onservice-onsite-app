// R-CUS-09 (4): on phones the booking-detail actions sit in a fixed bar under
// the page scroll. It could hold six buttons plus a paragraph with no height
// limit, so on a small phone it could cover most of the screen and push
// buttons out of reach. The bar is now a scroll area with a height limit, and
// the main next step for the booking comes first in it.
//
// The screen is rendered at 320 x 568 (iPhone SE first generation size).
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const SMALL_PHONE = { width: 320, height: 568, scale: 2, fontScale: 1 };

// Same pattern as the Bug UX-1337 test: flatten RN style arrays so the DOM
// style can be read, and report a small phone window.
jest.mock('react-native', () => {
  const native = jest.requireActual('../__mocks__/react-native.js');
  const runtime = require('react') as typeof React;
  return {
    ...native,
    View: ({ style, ...props }: { style?: unknown }) => runtime.createElement(native.View, { ...props, style: native.StyleSheet.flatten(style) }),
    ScrollView: ({ style, ...props }: { style?: unknown }) => runtime.createElement(native.ScrollView, { ...props, style: native.StyleSheet.flatten(style) }),
    useWindowDimensions: () => SMALL_PHONE,
    Dimensions: { ...native.Dimensions, get: () => SMALL_PHONE },
  };
});
jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, name) => (typeof name === 'string' && name !== 'then' ? () => null : undefined) }),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: jest.fn().mockRejectedValue(new Error('not needed in this test')),
}));
jest.mock('@/services/review.service', () => ({ getBookingReview: jest.fn().mockResolvedValue(null) }));

const mockGetBookingById = jest.fn();
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

import BookingDetailScreen from '../app/customer/booking/[id]';

const finishedJob = {
  id: 'booking-1',
  customerId: 'customer-1',
  providerId: 'provider-1',
  providerName: 'Juan Dela Cruz',
  bookingType: 'fixed_price',
  escrowStatus: 'held',
  servicePrice: 150000,
  serviceFee: 0,
  totalAmount: 150000,
  description: 'Aircon deep clean',
  address: '42 Governor Cuenco Avenue',
  barangay: 'Kasambagan',
  city: 'Cebu City',
  scheduledAt: '2026-10-10T01:00:00.000Z',
  completedAt: '2026-10-10T04:00:00.000Z',
  jobPhotos: [],
  providerBeforePhotos: [],
  providerAfterPhotos: ['https://files.example.test/after-1.jpg'],
  createdAt: '2026-10-09T01:00:00.000Z',
  serviceName: 'Aircon Deep Clean',
};

function renderDetail(booking: Record<string, unknown>): void {
  mockGetBookingById.mockResolvedValue(booking);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetBookingById.mockReset();
});

it('Bug R-CUS-09-09 — on a small phone the six booking actions sit in a height-limited scroll area and every one still works', async () => {
  renderDetail({ ...finishedJob, status: 'completed_by_provider' });

  const actions = [
    'Confirm & Review',
    'Parts & Materials / Change Orders',
    'View Job Photos',
    'Chat with Provider',
    'File a Dispute',
    'Get Support',
  ];
  const support = await screen.findByRole('button', { name: 'Get Support' });
  const bar = support.closest('rn-scroll-view') as HTMLElement | null;
  expect(bar).not.toBeNull();
  // It is the action bar, not the page scroll that holds the receipt.
  expect(within(bar!).queryByText('Receipt')).toBeNull();
  expect(screen.getByText('Receipt')).toBeTruthy();
  // Bounded: never more than half of the 568 px window.
  const maxHeight = parseFloat(bar!.style.maxHeight);
  expect(maxHeight).toBeGreaterThan(0);
  expect(maxHeight).toBeLessThanOrEqual(SMALL_PHONE.height / 2);
  // The change-order note travels with the actions inside the same area.
  expect(within(bar!).getByText(/Extra parts or materials are handled here/)).toBeTruthy();

  actions.forEach((name, index) => {
    fireEvent.click(within(bar!).getByRole('button', { name }));
    expect(mockPush).toHaveBeenCalledTimes(index + 1);
  });
});

it('Bug R-CUS-09-10 — on a small phone a finished booking puts "Leave a Review" first, above the other actions', async () => {
  renderDetail({ ...finishedJob, status: 'confirmed', escrowStatus: 'released' });

  const review = await screen.findByRole('button', { name: 'Leave a Review' });
  for (const name of ['Parts & Materials / Change Orders', 'View Job Photos', 'File a Dispute', 'Get Support']) {
    const other = screen.getByRole('button', { name });
    expect(review.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
});
