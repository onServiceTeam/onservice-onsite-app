import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';
import { Routes } from '@/config/navigation';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1344 — no date overrides does not claim an unqueried weekly schedule is active', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  expect(await screen.findByText('No Date Overrides')).toBeTruthy();
  expect(screen.queryByText(/Your weekly schedule is active/)).toBeNull();
  expect(screen.getByText(/Check Weekly schedule to review your normal working hours/)).toBeTruthy();
  fireEvent.click(screen.getByText('Weekly schedule', { exact: true }));
  expect(mockPush).toHaveBeenCalledWith(Routes.PROVIDER.SCHEDULE);
  view.unmount(); client.clear();
});
