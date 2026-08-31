import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn(),
}));

import HelpScreen from '../app/customer/help';

it('Bug UX-656 — provider vetting help describes recorded review and does not promise a background check before every booking', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HelpScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByRole('button', { name: /Are providers background-checked\?/i }));
  expect(screen.getByText(/Approval and document-expiry status are recorded/i)).toBeTruthy();
  expect(screen.getByText(/does not mean a new background check is run before every booking/i)).toBeTruthy();
  expect(screen.queryByText(/ongoing background checks/i)).toBeNull();
});
