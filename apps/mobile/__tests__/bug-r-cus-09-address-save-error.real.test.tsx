// R-CUS-09 (3): when saving an address failed, the screen only ever said
// "Failed to save address." It read err.response.data.error.message, but the
// app's fetch client throws ApiError, which keeps the server's answer in
// err.body (apps/mobile/src/services/api.ts). The screen now uses the shared
// getErrorMessage helper, so the server's real reason reaches the customer.
// A failure the server did not explain (a gateway error page during a deploy,
// no connection) still shows the screen's own plain message: the helper on
// its own would show "HTTP 502" or the browser's network text there.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/services/api';

const mockShowToast = jest.fn();
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

const mockGetAddresses = jest.fn();
const mockCreateAddress = jest.fn();
const mockUpdateAddress = jest.fn();
jest.mock('@/services/address.service', () => ({
  getAddresses: (...args: unknown[]) => mockGetAddresses(...args),
  createAddress: (...args: unknown[]) => mockCreateAddress(...args),
  updateAddress: (...args: unknown[]) => mockUpdateAddress(...args),
  deleteAddress: jest.fn(),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: false, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressesScreen from '../app/customer/addresses';

const savedHome = {
  id: 'address-1',
  label: 'Home',
  fullAddress: '42 Governor Cuenco Avenue',
  barangay: 'Kasambagan',
  city: 'Cebu City',
  province: 'Cebu',
  region: null,
  zipCode: null,
  latitude: 10.3294,
  longitude: 123.9124,
  isDefault: true,
  notes: null,
  createdAt: '2026-10-01T01:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
};

function renderAddresses(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AddressesScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockShowToast.mockReset();
  mockGetAddresses.mockReset();
  mockCreateAddress.mockReset();
  mockUpdateAddress.mockReset();
});

it('Bug R-CUS-09-07 — when adding an address fails, the customer sees the reason the server gave', async () => {
  mockGetAddresses.mockResolvedValue([]);
  // What the API sends at the address limit (packages/api address.service).
  mockCreateAddress.mockRejectedValue(new ApiError(
    400,
    { success: false, error: { message: 'Maximum of 10 saved addresses allowed.', statusCode: 400 } },
    'HTTP 400',
  ));
  renderAddresses();

  fireEvent.click(await screen.findByRole('button', { name: 'Add Your First Address' }));
  fireEvent.input(screen.getByLabelText('Full address'), { target: { value: 'A.S. Fortuna Street' } });
  fireEvent.input(screen.getByLabelText('Barangay'), { target: { value: 'Banilad' } });
  fireEvent.input(screen.getByLabelText('City or municipality'), { target: { value: 'Mandaue' } });
  fireEvent.input(screen.getByLabelText('Province'), { target: { value: 'Cebu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Maximum of 10 saved addresses allowed.', 'error'));
  expect(mockShowToast).not.toHaveBeenCalledWith('Failed to save address.', 'error');
});

it('Bug R-CUS-09-08 — when changing a saved address fails, the customer sees the reason the server gave', async () => {
  mockGetAddresses.mockResolvedValue([savedHome]);
  // A validation refusal: the useful reason is in the details list.
  mockUpdateAddress.mockRejectedValue(new ApiError(
    400,
    {
      success: false,
      error: {
        message: 'Validation failed',
        statusCode: 400,
        details: [{ field: 'barangay', message: 'Barangay must be 100 characters or less.' }],
      },
    },
    'HTTP 400',
  ));
  renderAddresses();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Home address' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Barangay must be 100 characters or less.', 'error'));
  expect(mockUpdateAddress).toHaveBeenCalledWith('address-1', expect.objectContaining({ barangay: 'Kasambagan' }));
  expect(mockShowToast).not.toHaveBeenCalledWith('Failed to update address.', 'error');
});

it('Bug R-CUS-09-11 — when adding an address fails without a reason from the server, the customer sees "Failed to save address." and not "HTTP 502"', async () => {
  mockGetAddresses.mockResolvedValue([]);
  // A gateway error page (nginx 502 during a deploy) is not JSON, so the
  // fetch client builds ApiError with no body and the message "HTTP 502".
  mockCreateAddress.mockRejectedValue(new ApiError(502, null, 'HTTP 502'));
  renderAddresses();

  fireEvent.click(await screen.findByRole('button', { name: 'Add Your First Address' }));
  fireEvent.input(screen.getByLabelText('Full address'), { target: { value: 'A.S. Fortuna Street' } });
  fireEvent.input(screen.getByLabelText('Barangay'), { target: { value: 'Banilad' } });
  fireEvent.input(screen.getByLabelText('City or municipality'), { target: { value: 'Mandaue' } });
  fireEvent.input(screen.getByLabelText('Province'), { target: { value: 'Cebu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to save address.', 'error'));
  expect(mockShowToast).not.toHaveBeenCalledWith('HTTP 502', 'error');
});

it('Bug R-CUS-09-12 — when changing an address fails because the connection dropped, the customer sees "Failed to update address." and not the network error text', async () => {
  mockGetAddresses.mockResolvedValue([savedHome]);
  // What fetch throws on React Native when there is no connection.
  mockUpdateAddress.mockRejectedValue(new TypeError('Network request failed'));
  renderAddresses();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Home address' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to update address.', 'error'));
  expect(mockShowToast).not.toHaveBeenCalledWith('Network request failed', 'error');
});
