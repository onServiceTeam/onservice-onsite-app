import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/utils/cancellation-policy', () => ({
  fetchCancellationPolicy: jest.fn().mockResolvedValue(null),
  policyToHelpAnswer: jest.fn().mockReturnValue('Current cancellation policy.'),
}));

import HelpScreen from '../app/customer/help';

it('Bug UX-222 — customer Help conditions escrow on paid-and-held state and describes change orders as records, not blanket protection', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><HelpScreen /></QueryClientProvider>);

  fireEvent.click(screen.getByText('How does the quoting system work?'));
  expect(screen.getByText(/When checkout succeeds and the booking shows paid and held/i)).toBeTruthy();

  fireEvent.click(screen.getByText('What if the job needs extra parts or materials?'));
  expect(screen.getByText(/scope, amount, and payment state stay in the booking record/i)).toBeTruthy();
  expect(screen.queryByText(/so you stay protected/i)).toBeNull();

  fireEvent.click(screen.getByText('How does escrow work?'));
  expect(screen.getByText(/Release can follow your completion confirmation or the platform completion timer/i)).toBeTruthy();
  expect(screen.getByText(/filing a case does not by itself prove funds remain held/i)).toBeTruthy();
});
