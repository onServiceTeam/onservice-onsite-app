// A7 — customer/addresses now uses the shared UI kit (EmptyState / ErrorState /
// OptimizedList) and toast feedback. Real DOM-render tests (jsdom + RTL) that
// drive the data layer (mocked address.service) through each state and assert
// on the actual rendered output.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn(),
  createAddress: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
}));

import AddressesScreen from '../../app/customer/addresses';
import * as addressService from '@/services/address.service';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(AddressesScreen)),
  );
  return { container };
}

const sampleAddress = {
  id: 'a1',
  label: 'Home' as const,
  fullAddress: '123 Mango Street, Cebu City',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
  isDefault: true,
  notes: undefined,
};

beforeEach(() => {
  (addressService.getAddresses as jest.Mock).mockReset();
});

describe('A7 — customer/addresses shared-kit states', () => {
  it('renders the EmptyState (kit) with its primary action when there are no addresses', async () => {
    (addressService.getAddresses as jest.Mock).mockResolvedValue([]);
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No Saved Addresses');
    });
    // EmptyState's primary action ("Add Your First Address").
    expect(container.textContent).toContain('Add Your First Address');
  });

  it('renders the ErrorState (kit) with a retry affordance when the query fails', async () => {
    (addressService.getAddresses as jest.Mock).mockRejectedValue(new Error('network down'));
    const { container } = renderScreen();
    await waitFor(() => {
      // ErrorState default title + its "Try Again" retry button.
      expect(container.textContent).toContain('Try Again');
    });
    expect(container.textContent?.toLowerCase()).toContain('addresses');
  });

  it('renders the address list when data loads', async () => {
    (addressService.getAddresses as jest.Mock).mockResolvedValue([sampleAddress]);
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('123 Mango Street, Cebu City');
    });
  });
});
