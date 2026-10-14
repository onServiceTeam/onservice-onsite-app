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
// D38 Milestone 2 (P5b): the lead detail is read through request.service.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Kitchen Plumbing', categoryName: 'Plumbing',
    description: 'Replace the leaking sink drain and inspect the cabinet damage.',
    urgency: 'within_3_days', budgetMin: 100_000, budgetMax: 200_000,
    jobPhotos: ['https://example.test/photo.jpg'], intakeAnswers: { sink_type: 'Double bowl', has_parts: false },
  }),
  submitQuote: jest.fn(),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockImplementation(async (url: string) => {
      // The request's media (the gallery): a photo from an app older than 1.0.4.
      if (url === '/api/v1/job-media/booking/booking-1') {
        return { data: { success: true, data: { items: [], legacyPhotos: ['https://example.test/photo.jpg'] } } };
      }
      return { data: { data: { tier: 'pro', commissionRate: 0.11 } } };
    }),
  },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

// D38 human audit (2026-10-13) changed how two of these facts read: the budget
// is now "Budget ₱X to ₱Y" (was "₱X - ₱Y"). D38 Milestone 2 (P5b) shows the
// customer's photos, video and voice note through the shared request gallery
// ("What the customer sent"), with a button to open the photos full screen,
// instead of the "Customer photos (1)" strip. The facts this test pins are all
// still beside the pricing form.
it('Bug UX-126 — desktop quote builder keeps the customer scope, budget, timing, evidence, and intake beside pricing', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('Kitchen Plumbing')).toBeTruthy();
  expect(screen.getByText('Budget ₱1,000.00 to ₱2,000.00')).toBeTruthy();
  expect(screen.getByText('Within 3 days')).toBeTruthy();
  expect(await screen.findByText('What the customer sent')).toBeTruthy();
  expect(container.querySelector('[aria-label="Job photo 1"]')).toBeTruthy();
  expect(screen.getByRole('button', { name: "View the customer's photos full screen, 1 photo" })).toBeTruthy();
  expect(screen.getByText('Double bowl')).toBeTruthy();
  expect(screen.getByLabelText('Wide provider quote workspace')).toBeTruthy();
});
