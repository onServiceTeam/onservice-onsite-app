import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn().mockReturnValue('Current cancellation policy.'),
}));

import HelpScreen from '../app/customer/help';

it('BUG-UX-195 — account help routes users to self-service and discloses retained operational records', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <HelpScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByText('How do I delete my account?'));
  expect(screen.getByText(/Open Account & Data from your profile/i)).toBeTruthy();
  expect(screen.getByText(/records may be retained where required/i)).toBeTruthy();
  expect(screen.queryByText(/all data is permanently deleted/i)).toBeNull();
});
