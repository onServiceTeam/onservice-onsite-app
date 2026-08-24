import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({}),
}));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null), policyToTermsText: jest.fn(),
}));

import TermsScreen from '../app/customer/terms';

it('Bug UX-232 — customer Terms describe the actual in-app chat capability instead of an unbuilt phone-masking service', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TermsScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByText('8. Platform Protections — No Insurance'));
  expect(screen.getByText(/In-app booking chat without displaying personal phone numbers/i)).toBeTruthy();
  expect(screen.queryByText(/Masked phone numbers between customer and provider/i)).toBeNull();
});
