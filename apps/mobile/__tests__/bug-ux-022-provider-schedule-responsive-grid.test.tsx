import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: jest.fn().mockResolvedValue([]),
  setMySchedule: jest.fn().mockResolvedValue([]),
}));

import ScheduleScreen from '../app/provider/schedule';

it('Bug UX-022 — provider weekly schedule reflows into a desktop grid with preserved day controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ScheduleScreen /></QueryClientProvider>);

  const grid = await screen.findByLabelText('Weekly schedule grid');
  expect(screen.queryByLabelText('Weekly schedule list')).toBeNull();
  expect(grid.children).toHaveLength(7);
  expect(screen.getByLabelText('Monday schedule')).toBeTruthy();
  expect(screen.getByText('Save Schedule')).toBeTruthy();
});
