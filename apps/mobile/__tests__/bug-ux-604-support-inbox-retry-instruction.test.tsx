import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listMyTickets } from '@/services/support.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/support.service', () => ({
  listMyTickets: jest.fn().mockRejectedValue(new Error('support unavailable')),
  SUPPORT_TYPE_LABELS: {}, SUPPORT_STATUS_LABELS: {},
}));

import SupportInboxScreen from '../app/support/index';

it('Bug UX-604 — support inbox failure offers the retry control it actually implements', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportInboxScreen /></QueryClientProvider>);

  expect(await screen.findByText('We could not load your requests.')).toBeTruthy();
  expect(screen.queryByText(/Pull to retry/i)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading support requests' }));
  await waitFor(() => expect(listMyTickets).toHaveBeenCalledTimes(2));
});
