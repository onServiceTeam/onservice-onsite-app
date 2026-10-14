// HA-REQ-10 (customer human audit 2026-10-13, D38): before pricing, the
// provider sees what the customer sent. The quote screen shows the photos as
// thumbnails that open a full-screen viewer, and each answer under the
// question the admin wrote (not the internal key).
//
// D38 Milestone 2 (package P5b): the photos, video and voice note now show
// through the shared request gallery ("What the customer sent", fed by
// GET /api/v1/job-media/booking/:id; photos from apps older than 1.0.4 come
// back as legacyPhotos), and "View photos full screen" opens the viewer at
// the first photo. The lead detail is read through request.service.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const PHOTOS = ['https://app.onservice.ph/uploads/job-request/one.jpg', 'https://app.onservice.ph/uploads/job-request/two.jpg'];

const mockRequest = {
  id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
  categoryName: 'Aircon Services', serviceName: 'Aircon repair',
  description: 'Bedroom aircon blows warm air and drips water.',
  urgency: 'same_day', budgetMin: 150000, budgetMax: 250000,
  jobPhotos: PHOTOS,
  jobVideoUrl: null,
  intakeAnswers: { unit_count: 2, has_power: true },
  intakeQuestions: [
    { key: 'unit_count', label: 'How many aircon units need work?', unit: 'units', value: 2 },
    { key: 'has_power', label: 'Does the unit still turn on?', unit: null, value: true },
  ],
  barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Ana C.',
  distanceKm: 2.1, createdAt: '2026-10-13T01:00:00.000Z',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockImplementation(async () => mockRequest),
  submitQuote: jest.fn(),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockImplementation(async (url: string) => {
      if (url === '/api/v1/job-media/booking/booking-1') {
        return { data: { success: true, data: { items: [], legacyPhotos: ['https://app.onservice.ph/uploads/job-request/one.jpg', 'https://app.onservice.ph/uploads/job-request/two.jpg'] } } };
      }
      return { data: { data: { tier: 'new', commissionRate: 0.15 } } };
    }),
  },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

function renderScreen(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
}

it('HA-REQ-10: the quote screen shows the customer photos as thumbnails and each answer under its question label', async () => {
  const { container } = renderScreen();

  expect(await screen.findByText('Aircon repair')).toBeTruthy();
  expect(await screen.findByText('What the customer sent')).toBeTruthy();
  expect(screen.getByRole('button', { name: "View the customer's photos full screen, 2 photos" })).toBeTruthy();
  const thumbnails = Array.from(container.querySelectorAll('[aria-label^="Job photo"] Image'))
    .map((node) => node.getAttribute('source'));
  expect(thumbnails).toEqual(PHOTOS);

  expect(screen.getByText('How many aircon units need work?')).toBeTruthy();
  expect(screen.getByText('2 units')).toBeTruthy();
  expect(screen.getByText('Does the unit still turn on?')).toBeTruthy();
  expect(screen.getByText('Yes')).toBeTruthy();
  expect(screen.queryByText('Unit Count')).toBeNull();
  expect(screen.queryByText('Has Power')).toBeNull();

  // Description and budget are stated at the top.
  expect(screen.getByText('Bedroom aircon blows warm air and drips water.')).toBeTruthy();
  expect(screen.getByText('Budget ₱1,500.00 to ₱2,500.00')).toBeTruthy();
});

it('HA-REQ-10: "View photos full screen" opens the first photo, Next moves on, and Close returns to the quote', async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: "View the customer's photos full screen, 2 photos" }));

  expect(screen.getByText('Photo 1 of 2')).toBeTruthy();
  expect(screen.getByLabelText('Customer photo 1, full screen').querySelector('Image')?.getAttribute('source')).toBe(PHOTOS[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByText('Photo 2 of 2')).toBeTruthy();
  expect(screen.getByLabelText('Customer photo 2, full screen').querySelector('Image')?.getAttribute('source')).toBe(PHOTOS[1]);

  fireEvent.click(screen.getByRole('button', { name: 'Close photo' }));
  expect(screen.queryByText(/Photo \d of 2/)).toBeNull();
});
