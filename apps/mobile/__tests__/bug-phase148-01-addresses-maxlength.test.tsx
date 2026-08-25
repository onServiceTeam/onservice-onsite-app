import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([]),
  createAddress: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: false, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressesScreen from '../app/customer/addresses';

it('Bug PHASE148-01 — the rendered saved-address form enforces the same text limits as the API', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Add Your First Address' }));
  expect(screen.getByLabelText('Full address').getAttribute('maxlength')).toBe('500');
  expect(screen.getByLabelText('Barangay').getAttribute('maxlength')).toBe('100');
  expect(screen.getByLabelText('City or municipality').getAttribute('maxlength')).toBe('100');
  expect(screen.getByLabelText('Province').getAttribute('maxlength')).toBe('100');
  expect(screen.getByLabelText('Address notes').getAttribute('maxlength')).toBe('500');
});
