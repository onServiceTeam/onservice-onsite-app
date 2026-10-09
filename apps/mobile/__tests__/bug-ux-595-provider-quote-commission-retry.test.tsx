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
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Repair', description: 'Repair request', jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockRejectedValue(new Error('commission unavailable')) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug UX-595 — a quote with an unavailable live commission provides a direct retry before relying on net earnings', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Repair');
  fireEvent.change(screen.getByPlaceholderText('Item description'), { target: { value: 'Labor and parts' } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } });

  expect(await screen.findByText('Commission preview unavailable')).toBeTruthy();
  expect(screen.queryByText('Your net earnings')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
