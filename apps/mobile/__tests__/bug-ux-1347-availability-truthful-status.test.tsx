import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

let mockAvailable = false;
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: () => Promise.resolve(mockAvailable),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1347 — current availability describes automatic matching without falsely hiding the public profile or cancelling existing work', async () => {
  for (const available of [false, true]) {
    mockAvailable = available;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
    await screen.findByText('No Date Overrides');
    expect(screen.getByText(available
      ? 'You are open to new job offers that match your services and working hours.'
      : 'Automatic job matching is paused. Your profile may still appear in search.')).toBeTruthy();
    expect(screen.queryByText(/You are hidden from search/)).toBeNull();
    expect(screen.getByText('Changing availability does not cancel or reschedule existing bookings.')).toBeTruthy();
    view.unmount(); client.clear();
  }
});
