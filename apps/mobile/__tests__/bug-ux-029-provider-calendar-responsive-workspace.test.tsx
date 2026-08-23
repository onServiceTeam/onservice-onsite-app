import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getCalendarData: jest.fn().mockResolvedValue({ jobs: [], overrides: [] }),
}));

import ProviderCalendarScreen from '../app/provider/calendar';

it('Bug UX-029 — provider calendar uses a wide month-and-selected-day workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderCalendarScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Provider calendar workspace');
  const month = screen.getByLabelText('Monthly calendar grid');
  const selectedDay = screen.getByLabelText('Selected day schedule');
  expect(workspace.contains(month)).toBe(true);
  expect(workspace.contains(selectedDay)).toBe(true);
  expect(screen.getByLabelText('Manage availability')).toBeTruthy();
});
