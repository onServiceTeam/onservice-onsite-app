import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listTemplates } from '@/services/provider-crm.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Aircon repair', description: 'Aircon is not cooling',
    jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockRejectedValue(new Error('templates unavailable')),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.13 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug UX-594 — a failed quote-template feed is not presented as no matching templates', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Use template'));
  expect(await screen.findByText('Quote templates unavailable')).toBeTruthy();
  expect(screen.queryByText(/No templates match/i)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(listTemplates).toHaveBeenCalledTimes(2));
});
