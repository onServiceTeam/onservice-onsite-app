import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
// D38 Milestone 2 (P5b): the lead detail is read through request.service.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Repair', categoryName: 'Plumbing', description: 'Repair request',
    urgency: null, budgetMin: null, budgetMax: null, jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

// D38 Milestone 2 (P5b): the quote is a total price in pesos (line items are
// optional behind "Add an itemized breakdown"), and the commission label no
// longer uses an em dash. The preview still uses the server-returned rate.
it('Bug UX-128 — provider quote preview uses the server-returned live commission rate', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Repair');
  fireEvent.change(screen.getByLabelText('Total price in pesos'), { target: { value: '1000' } });

  expect(await screen.findByText('− Platform commission (11%, pro tier)')).toBeTruthy();
  expect(screen.getByText('−₱110.00')).toBeTruthy();
  expect(screen.getByText('₱890.00')).toBeTruthy();
});
