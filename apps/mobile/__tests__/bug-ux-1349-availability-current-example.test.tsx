import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1349 — the date example teaches today in Manila instead of a permanently expired date', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-05T16:30:00Z'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  try {
    fireEvent.click(await screen.findByText('+ Add', { exact: true }));
    expect(screen.getByText('Example: 2026-09-06 (today in Manila)')).toBeTruthy();
    expect(screen.queryByText('Example: 2026-08-31')).toBeNull();
  } finally { view.unmount(); client.clear(); jest.useRealTimers(); }
});
