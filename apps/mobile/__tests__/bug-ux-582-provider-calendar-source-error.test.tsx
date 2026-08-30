import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getCalendarData } from '@/services/provider-api.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getCalendarData: jest.fn().mockRejectedValue(new Error('calendar unavailable')),
}));

import ProviderCalendarScreen from '../app/provider/calendar';

it('Bug UX-582 — a failed provider calendar source is not presented as an empty selected day', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderCalendarScreen /></QueryClientProvider>);

  expect(await screen.findByText('Calendar unavailable')).toBeTruthy();
  expect(screen.queryByText('No jobs scheduled')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getCalendarData).toHaveBeenCalledTimes(2));
});
