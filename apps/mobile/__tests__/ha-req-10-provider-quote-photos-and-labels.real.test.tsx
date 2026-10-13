// HA-REQ-10 (customer human audit 2026-10-13, D38): before pricing, the
// provider sees what the customer sent. The quote screen shows the photos as
// tappable thumbnails that open a full-screen viewer, and each answer under
// the question the admin wrote (not the internal key).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRequest = {
  id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
  categoryName: 'Aircon Services', serviceName: 'Aircon repair',
  description: 'Bedroom aircon blows warm air and drips water.',
  urgency: 'same_day', budgetMin: 150000, budgetMax: 250000,
  jobPhotos: ['https://app.onservice.ph/uploads/job-request/one.jpg', 'https://app.onservice.ph/uploads/job-request/two.jpg'],
  jobVideoUrl: null,
  intakeAnswers: { unit_count: 2, has_power: true },
  intakeQuestions: [
    { key: 'unit_count', label: 'How many aircon units need work?', unit: 'units', value: 2 },
    { key: 'has_power', label: 'Does the unit still turn on?', unit: null, value: true },
  ],
  barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Ana Cruz',
  distanceKm: 2.1, createdAt: '2026-10-13T01:00:00.000Z',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockImplementation(async () => mockRequest),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

function renderScreen(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
}

it('HA-REQ-10: the quote screen shows the customer photos as thumbnails and each answer under its question label', async () => {
  renderScreen();

  expect(await screen.findByText('Aircon repair')).toBeTruthy();
  expect(screen.getByText('Customer photos (2)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open customer photo 1 of 2' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open customer photo 2 of 2' })).toBeTruthy();
  const thumbnails = Array.from(document.querySelectorAll('Image')).map((node) => node.getAttribute('source'));
  expect(thumbnails).toEqual(mockRequest.jobPhotos);

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

it('HA-REQ-10: tapping a thumbnail opens that photo full screen, and Close returns to the quote', async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: 'Open customer photo 2 of 2' }));

  expect(screen.getByText('Photo 2 of 2')).toBeTruthy();
  const fullScreen = screen.getByLabelText('Customer photo 2, full screen');
  expect(fullScreen.querySelector('Image')?.getAttribute('source')).toBe(mockRequest.jobPhotos[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByText('Photo 1 of 2')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Close photo' }));
  expect(screen.queryByText(/Photo \d of 2/)).toBeNull();
});
