import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetchCancellationPolicy = jest.fn().mockRejectedValue(new Error('network unavailable'));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: (...args: unknown[]) => mockFetchCancellationPolicy(...args),
  policyToTermsText: jest.fn(),
}));

import TermsScreen from '../app/customer/terms';

it('Bug UX-329 — a failed live cancellation-policy load is disclosed and offers a working retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><TermsScreen /></QueryClientProvider>);

  expect((await screen.findByRole('alert')).textContent).toContain('Current cancellation policy unavailable');
  fireEvent.click(screen.getByLabelText('Retry cancellation policy'));
  await waitFor(() => expect(mockFetchCancellationPolicy).toHaveBeenCalledTimes(2));
});
