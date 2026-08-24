import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn(),
}));

import HelpScreen from '../app/customer/help';

it('Bug UX-210 — customer Help states the active payment hold and does not promise an automatic 1–3 day dispute refund', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><HelpScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByText('What payment methods are accepted?'));
  expect(screen.getByText(/existing onService wallet balance is currently available/i)).toBeTruthy();
  expect(screen.getByText(/wallet top-up authorization is temporarily disabled/i)).toBeTruthy();

  fireEvent.click(screen.getByText('How do I get a refund?'));
  expect(screen.getByText(/does not promise a fixed 1–3 day result/i)).toBeTruthy();
  expect(screen.queryByText(/Refunds are credited to your wallet within 1-3 business days/i)).toBeNull();
});
