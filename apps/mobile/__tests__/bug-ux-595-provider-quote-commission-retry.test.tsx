import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
// D38 Milestone 2 (P5b): the lead detail is read through request.service.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Repair', description: 'Repair request', jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockImplementation(async (url: string) => {
      // The request gallery has nothing to show; only the commission read fails.
      if (url.startsWith('/api/v1/job-media/')) return { data: { success: true, data: { items: [], legacyPhotos: [] } } };
      throw new Error('commission unavailable');
    }),
  },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

const commissionCalls = (): number => jest.mocked(api.get).mock.calls
  .filter((call) => String(call[0]).startsWith('/api/v1/providers/me/commission-preview')).length;

// D38 Milestone 2 (P5b): the price is now the total-price field (line items
// are optional behind "Add an itemized breakdown").
it('Bug UX-595 — a quote with an unavailable live commission provides a direct retry before relying on net earnings', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Repair');
  fireEvent.change(screen.getByLabelText('Total price in pesos'), { target: { value: '1000' } });

  expect(await screen.findByText('Commission preview unavailable')).toBeTruthy();
  expect(screen.queryByText('Your net earnings')).toBeNull();
  expect(commissionCalls()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(commissionCalls()).toBe(2));
});
