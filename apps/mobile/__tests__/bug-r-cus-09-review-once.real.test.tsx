// R-CUS-09 (2): "Leave a Review" stayed on a finished booking after the
// customer had already reviewed it, and pressing it ended in the server's 409
// "A review already exists for this booking." The booking screen now asks
// GET /api/v1/reviews/booking/:id (getBookingReview) and shows "You reviewed
// this job" instead. A slow or failed lookup must not break the screen, and
// submitting a review must update what the booking screen knows.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Icons are visual only; render nothing (as in the R-CUS-08 test).
jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, name) => (typeof name === 'string' && name !== 'then' ? () => null : undefined) }),
);
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'booking-1', bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn(), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: jest.fn().mockRejectedValue(new Error('not needed in this test')),
}));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    customerId: 'customer-1',
    providerId: 'provider-1',
    providerName: 'Juan Dela Cruz',
    bookingType: 'fixed_price',
    status: 'confirmed',
    escrowStatus: 'released',
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
    providerAfterPhotos: [],
    createdAt: '2026-10-09T01:00:00.000Z',
    serviceName: 'Aircon Deep Clean',
  }),
}));

const existingReview = {
  id: 'review-1',
  bookingId: 'booking-1',
  reviewerId: 'customer-1',
  providerId: 'provider-1',
  rating: 4,
  qualityRating: null,
  punctualityRating: null,
  professionalismRating: null,
  communicationRating: null,
  valueRating: null,
  comment: null,
  providerResponse: null,
  providerResponseAt: null,
  isVisible: true,
  isFlagged: false,
  images: [],
  createdAt: '2026-10-11T01:00:00.000Z',
};

const mockGetBookingReview = jest.fn();
const mockCreateReview = jest.fn();
jest.mock('@/services/review.service', () => ({
  getBookingReview: (...args: unknown[]) => mockGetBookingReview(...args),
  createReview: (...args: unknown[]) => mockCreateReview(...args),
}));

import BookingDetailScreen from '../app/customer/booking/[id]';
import ReviewScreen from '../app/customer/booking/review';

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function renderDetail(client = newClient()): QueryClient {
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockGetBookingReview.mockReset();
  mockCreateReview.mockReset();
});

it('Bug R-CUS-09-04 — a booking the customer already reviewed shows "You reviewed this job" and no "Leave a Review" button', async () => {
  mockGetBookingReview.mockResolvedValue(existingReview);
  renderDetail();

  expect(await screen.findByText('You reviewed this job')).toBeTruthy();
  expect(screen.getByText('You rated it 4 out of 5.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Leave a Review' })).toBeNull();
  expect(mockGetBookingReview).toHaveBeenCalledWith('booking-1');
});

it('Bug R-CUS-09-05 — while the review lookup is still loading, the booking shows but "Leave a Review" is not offered yet', async () => {
  mockGetBookingReview.mockReturnValue(new Promise(() => undefined));
  renderDetail();

  expect(await screen.findByText('Receipt')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Get Support' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Leave a Review' })).toBeNull();
  // Still not offered once the lookup is definitely in flight.
  await waitFor(() => expect(mockGetBookingReview).toHaveBeenCalledWith('booking-1'));
  expect(screen.queryByRole('button', { name: 'Leave a Review' })).toBeNull();
  expect(screen.queryByText('You reviewed this job')).toBeNull();
});

it('a booking with no review yet still offers "Leave a Review", which opens the review form', async () => {
  mockGetBookingReview.mockResolvedValue(null);
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Leave a Review' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/customer/booking/review', params: { bookingId: 'booking-1' } });
  expect(screen.queryByText('You reviewed this job')).toBeNull();
});

it('when the review lookup fails, the booking still shows and "Leave a Review" stays available', async () => {
  mockGetBookingReview.mockRejectedValue(new Error('network down'));
  renderDetail();

  expect(await screen.findByRole('button', { name: 'Leave a Review' })).toBeTruthy();
  expect(screen.getByText('Receipt')).toBeTruthy();
  expect(screen.getByText('Aircon Deep Clean')).toBeTruthy();
  expect(screen.queryByText('You reviewed this job')).toBeNull();
});

it('Bug R-CUS-09-06 — after the customer submits a review, the booking screen shows "You reviewed this job" instead of the old cached "no review" answer', async () => {
  // The booking screen was opened first and learned "no review yet".
  mockGetBookingReview.mockResolvedValue(null);
  const client = newClient();
  const firstVisit = render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);
  expect(await screen.findByRole('button', { name: 'Leave a Review' })).toBeTruthy();
  firstVisit.unmount();

  // The customer writes the review in the same app session.
  mockCreateReview.mockResolvedValue(existingReview);
  const reviewScreen = render(<QueryClientProvider client={client}><ReviewScreen /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('radio', { name: 'Overall rating, 4 stars' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/customer/booking/tip', params: { bookingId: 'booking-1' } }));
  reviewScreen.unmount();

  // From now on the server has the review. Coming back to the booking inside
  // the 30 second cache window must not reuse the old "no review" answer.
  mockGetBookingReview.mockResolvedValue(existingReview);
  renderDetail(client);
  expect(await screen.findByText('You reviewed this job')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Leave a Review' })).toBeNull();
});
