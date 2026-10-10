// Phase K MED-K02 + K04 - authentication response and error presentation.
//
// The tests below use real store/screen renders. They deliberately avoid
// source-text matching because the user-visible contract is what matters:
// malformed OTP responses must fail closed, and mutation failures must pass
// through the shared error normalizer before reaching the user.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockPut = jest.fn();
const mockGetBookingById = jest.fn();
const mockAvailabilityStatus = jest.fn();
const mockAvailabilityOverrides = jest.fn();
const mockAvailabilityAdd = jest.fn();
const mockToast = jest.fn();
const mockGetErrorMessage = jest.fn((_error: unknown, fallback: string) => `canonical: ${fallback}`);
const mockStoreTokens = jest.fn();
const mockStoreUser = jest.fn();
const mockClearTokens = jest.fn();
const mockClearStoredUser = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1', id: 'recurring-1' }),
}));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const ReactModule = require('react') as typeof React;
  return {
    ...actual,
    Switch: ({
      value,
      onValueChange,
      accessibilityLabel,
      disabled,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      accessibilityLabel?: string;
      disabled?: boolean;
    }) => ReactModule.createElement('input', {
      type: 'checkbox',
      checked: value,
      disabled,
      'aria-label': accessibilityLabel,
      onChange: () => onValueChange(!value),
    }),
  };
});
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
  setAuthSessionExpiredHandler: jest.fn(),
  storage: { set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/services/secure-storage', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  storeTokens: (...args: unknown[]) => mockStoreTokens(...args),
  clearTokens: () => mockClearTokens(),
  getStoredUser: jest.fn(),
  storeUser: (...args: unknown[]) => mockStoreUser(...args),
  clearStoredUser: () => mockClearStoredUser(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({
  getDeviceFingerprint: jest.fn().mockResolvedValue('device-1'),
}));
jest.mock('@/services/push-token.service', () => ({
  unregisterStoredPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityStatus: (...args: unknown[]) => mockAvailabilityStatus(...args),
  getAvailabilityOverrides: (...args: unknown[]) => mockAvailabilityOverrides(...args),
  addAvailabilityOverride: (...args: unknown[]) => mockAvailabilityAdd(...args),
  removeAvailabilityOverride: jest.fn(),
  toggleAvailability: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@/utils/errors', () => ({
  getErrorMessage: (error: unknown, fallback: string) => mockGetErrorMessage(error, fallback),
}));
jest.unmock('@/stores/auth.store');

import { useAuthStore } from '@/stores/auth.store';
import MakeRecurringScreen from '../app/customer/booking/make-recurring';
import RecurringDetailScreen from '../app/customer/recurring/[id]';
import AvailabilitySettingsScreen from '../app/provider/availability';
import PayoutSettingsScreen from '../app/provider/payout-settings';

const booking = {
  id: 'booking-1',
  categoryId: 'category-1',
  subcategoryId: 'subcategory-1',
  providerId: 'provider-1',
  bookingType: 'fixed_price',
  scheduledAt: '2026-08-19T17:30:00Z',
  serviceName: 'Home Cleaning',
  totalAmount: 55_000,
  address: '1 Test Street',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
};

const recurring = {
  id: 'recurring-1',
  categoryName: 'Cleaning',
  subcategoryName: 'Home Cleaning',
  providerName: 'Cebu Clean Co',
  frequency: 'weekly',
  preferredDay: 2,
  preferredTime: '09:00',
  status: 'active',
  servicePrice: 50_000,
  serviceFee: 5_000,
  totalAmount: 55_000,
  nextScheduledDate: '2099-09-08',
  address: '1 Test Street',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
  totalCompleted: 2,
  totalSkipped: 0,
  cancelReason: null,
  createdAt: '2026-08-01T00:00:00Z',
};

function renderWithQuery(child: React.ReactElement): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetErrorMessage.mockImplementation((_error: unknown, fallback: string) => `canonical: ${fallback}`);
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, otpRequestId: null });
});

describe('Phase K MED-K02 - verifyOtp validates the response at runtime', () => {
  it('K02 - malformed success data fails closed without storing credentials or authenticating', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { accessToken: '', refreshToken: 'refresh', user: {} } } });

    await expect(useAuthStore.getState().verifyOtp('+639171234567', '123456'))
      .rejects.toThrow('OTP verification returned no access token. Please try again.');

    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(mockStoreUser).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it('K02 - a valid response stores the session and clears the pending OTP request', async () => {
    const user = {
      id: 'customer-1',
      phone: '+639171234567',
      email: null,
      firstName: 'Ana',
      lastName: 'User',
      role: 'customer',
      avatarUrl: null,
    };
    mockPost.mockResolvedValueOnce({
      data: { data: { accessToken: 'access-1', refreshToken: 'refresh-1', user, isNewUser: false } },
    });

    await useAuthStore.getState().verifyOtp('+639171234567', '123456');

    expect(mockStoreTokens).toHaveBeenCalledWith('access-1', 'refresh-1');
    expect(mockStoreUser).toHaveBeenCalledWith(JSON.stringify(user));
    expect(useAuthStore.getState()).toMatchObject({ user, isAuthenticated: true, otpRequestId: null });
  });
});

describe('Phase K MED-K04 - real screen mutations use the shared error normalizer', () => {
  it('K04 - customer recurring setup presents the normalized mutation error', async () => {
    mockGetBookingById.mockResolvedValue(booking);
    mockGet.mockResolvedValue({ data: { data: { servicePrice: 50_000, serviceFee: 5_000, totalAmount: 55_000 } } });
    mockPost.mockRejectedValue(new Error('recurring failed'));
    renderWithQuery(<MakeRecurringScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set Up Weekly Booking' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      'canonical: Failed to create recurring booking.',
      'error',
    ));
    expect(mockGetErrorMessage).toHaveBeenCalledWith(expect.any(Error), 'Failed to create recurring booking.');
  });

  it('K04 - recurring cancellation presents the normalized mutation error and keeps the form usable', async () => {
    mockGet.mockResolvedValue({ data: { data: recurring } });
    mockPost.mockRejectedValue(new Error('cancellation failed'));
    renderWithQuery(<RecurringDetailScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel recurring booking' }));
    fireEvent.change(screen.getByLabelText('Recurring cancellation reason'), {
      target: { value: 'Schedule changed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recurring cancellation' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('canonical: Operation failed.', 'error'));
    expect(screen.getByLabelText('Recurring cancellation reason')).toBeTruthy();
    expect(mockGetErrorMessage).toHaveBeenCalledWith(expect.any(Error), 'Operation failed.');
  });

  it('K04 - availability override save presents the normalized mutation error', async () => {
    mockAvailabilityStatus.mockResolvedValue(true);
    mockAvailabilityOverrides.mockResolvedValue([]);
    mockAvailabilityAdd.mockRejectedValue(new Error('availability failed'));
    renderWithQuery(<AvailabilitySettingsScreen />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Add' }));
    fireEvent.change(screen.getByLabelText('Override date in YYYY-MM-DD format'), {
      target: { value: '2099-08-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Available Hours for This Date' }));
    fireEvent.change(screen.getByLabelText('Override start time in HH:MM'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Override end time in HH:MM'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('canonical: Operation failed.', 'error'));
    expect(mockGetErrorMessage).toHaveBeenCalledWith(expect.any(Error), 'Operation failed.');
  });

  it('K04 - payout preference save presents the normalized mutation error', async () => {
    mockGet.mockResolvedValue({ data: { data: {
      frequency: 'manual',
      minThreshold: 50_000,
      preferredMethod: 'gcash',
      destinationAccount: '09171234567',
    } } });
    mockPut.mockRejectedValue(new Error('payout failed'));
    renderWithQuery(<PayoutSettingsScreen />);

    const account = await screen.findByLabelText('Withdrawal account number');
    fireEvent.change(account, { target: { value: '09171234568' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save withdrawal details' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      'canonical: Failed to save withdrawal details.',
      'error',
    ));
    expect(mockGetErrorMessage).toHaveBeenCalledWith(expect.any(Error), 'Failed to save withdrawal details.');
    expect(mockPut).toHaveBeenCalledWith('/api/v1/wallet/payout-preferences', {
      preferredMethod: 'gcash',
      destinationAccount: '09171234568',
    });
  });
});
