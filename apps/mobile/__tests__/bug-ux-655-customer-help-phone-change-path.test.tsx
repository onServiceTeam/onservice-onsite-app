import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn(),
}));

import HelpScreen from '../app/customer/help';

it('Bug UX-655 — customer Help sends verified phone changes to the support path that actually exists', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HelpScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByRole('button', { name: /How do I update my profile\?/i }));
  expect(screen.getByText(/use the account-support link in Edit Profile/i)).toBeTruthy();
  expect(screen.queryByText(/OTP re-verification through Account & Data/i)).toBeNull();
});
