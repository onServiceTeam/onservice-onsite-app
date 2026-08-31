import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockRejectedValue(new Error('policy unavailable')),
  policyToHelpAnswer: jest.fn(),
}));

import HelpScreen from '../app/customer/help';

it('Bug UX-617 — failed cancellation policy does not leave customer help on a permanent loading answer', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HelpScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Current cancellation terms are unavailable/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Can I cancel a booking/i }));
  expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
  expect(screen.queryByText('Loading current cancellation policy…')).toBeNull();
});
