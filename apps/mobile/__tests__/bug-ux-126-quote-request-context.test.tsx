import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Kitchen Plumbing', categoryName: 'Plumbing',
    description: 'Replace the leaking sink drain and inspect the cabinet damage.',
    urgency: 'within_3_days', budgetMin: 100_000, budgetMax: 200_000,
    jobPhotos: ['https://example.test/photo.jpg'], intakeAnswers: { sink_type: 'Double bowl', has_parts: false },
  }),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

// D38 human audit (2026-10-13) changed how two of these facts read: the budget
// is now "Budget ₱X to ₱Y" (was "₱X - ₱Y"), and the photo count line
// "1 customer photo" became a labelled strip of tappable thumbnails. The
// facts this test pins are all still beside the pricing form.
it('Bug UX-126 — desktop quote builder keeps the customer scope, budget, timing, evidence, and intake beside pricing', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('Kitchen Plumbing')).toBeTruthy();
  expect(screen.getByText('Budget ₱1,000.00 to ₱2,000.00')).toBeTruthy();
  expect(screen.getByText('Within 3 days')).toBeTruthy();
  expect(screen.getByText('Customer photos (1)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open customer photo 1 of 1' })).toBeTruthy();
  expect(screen.getByText('Double bowl')).toBeTruthy();
  expect(screen.getByLabelText('Wide provider quote workspace')).toBeTruthy();
});
