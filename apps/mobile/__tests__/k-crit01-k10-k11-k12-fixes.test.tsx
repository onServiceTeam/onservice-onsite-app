// Phase K CRIT-K01 / K10 / K11 / K12 - mobile contract verification.
//
// These tests call the real service functions and render the real wallet hook
// instead of searching implementation text. No payment, top-up, or withdrawal
// is created: the API layer is mocked and the assertions inspect only request
// paths, returned data, and local state.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockSetSecureItem = jest.fn();
const mockGetSecureItem = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
}));
jest.mock('@/services/secure-storage', () => ({
  getSecureItem: (...args: unknown[]) => mockGetSecureItem(...args),
  setSecureItem: (...args: unknown[]) => mockSetSecureItem(...args),
}));
jest.mock('expo-application', () => ({
  applicationId: 'ph.onservice.app',
  nativeBuildVersion: '1',
  getInstallationTimeAsync: jest.fn().mockResolvedValue(new Date('2026-01-01T00:00:00.000Z')),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn().mockResolvedValue('fingerprint-1'),
}));
jest.unmock('@/services/secure-storage.service');
jest.unmock('@/services/device-fingerprint.service');

import { getWalletBalance, topUpWallet } from '../src/services/payment.service';
import { useWallet } from '../src/hooks/useWallet';
import {
  getAccessToken as getLegacyAccessToken,
  getSecureItem as getLegacySecureItem,
  getPublicItem,
  setPublicItem,
  setSecureItem as setLegacySecureItem,
} from '../src/services/secure-storage.service';
import { getDeviceFingerprint } from '../src/services/device-fingerprint.service';

function WalletProbe(): React.ReactElement {
  const wallet = useWallet();
  return (
    <div>
      <span>available:{wallet.availableBalance}</span>
      <span>pending:{wallet.pendingBalance}</span>
      <span>transactions:{wallet.transactions.length}</span>
    </div>
  );
}

function renderWallet(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WalletProbe />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSecureItem.mockReturnValue(undefined);
});

describe('Phase K CRIT-K11 / K12 - wallet service and hook use the canonical API contract', () => {
  it('K11 - direct wallet balance and top-up calls use singular server routes', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: {
      id: 'wallet-1', userId: 'customer-1', type: 'customer',
      availableBalance: 125_000, pendingBalance: 20_000, currency: 'PHP', createdAt: '2026-01-01',
    } } });
    mockPost.mockResolvedValueOnce({ data: { data: {
      topUpId: 'top-up-1', amount: 50_000, paymentMethod: 'gcash',
      paymentIntent: { id: 'intent-1' }, message: 'Top-up created',
    } } });

    await getWalletBalance();
    await topUpWallet(50_000, 'gcash');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/wallet');
    expect(mockPost).toHaveBeenCalledWith('/api/v1/wallet/top-up', {
      amount: 50_000,
      paymentMethod: 'gcash',
    });
    expect(mockGet.mock.calls.some(([path]) => path === '/api/v1/wallets')).toBe(false);
  });

  it('K12 - the rendered wallet hook exposes the backend camelCase balances', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/wallet') {
        return Promise.resolve({ data: { data: {
          id: 'wallet-1', userId: 'customer-1', type: 'customer',
          availableBalance: 125_000, pendingBalance: 20_000, currency: 'PHP', createdAt: '2026-01-01',
        } } });
      }
      return Promise.resolve({ data: { data: [{ id: 'tx-1' }] } });
    });
    renderWallet();

    await waitFor(() => expect(screen.getByText('available:125000')).toBeTruthy());
    expect(screen.getByText('pending:20000')).toBeTruthy();
    expect(screen.getByText('transactions:1')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/wallet');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/wallet/transactions?pageSize=20');
  });
});

describe('Phase K CRIT-K01 - legacy secure storage fails loudly while public state remains available', () => {
  it('K01 - legacy secure reads and writes throw a deprecation error', () => {
    expect(() => getLegacySecureItem('accessToken')).toThrow(/secure-storage\.service is DEPRECATED/i);
    expect(() => setLegacySecureItem('accessToken', 'token')).toThrow(/Use .*services\/secure-storage/i);
    expect(() => getLegacyAccessToken()).toThrow(/secure-storage\.service is DEPRECATED/i);
  });

  it('K01 - non-sensitive public storage still round-trips safely', () => {
    setPublicItem('accessibility:largeText', 'true');
    expect(getPublicItem('accessibility:largeText')).toBe('true');
  });

  it('K01 - device fingerprint reads and writes through the canonical secure store', async () => {
    const first = await getDeviceFingerprint();
    expect(first).toBe('fingerprint-1');
    expect(mockGetSecureItem).toHaveBeenCalledWith('device:fingerprint');
    expect(mockSetSecureItem).toHaveBeenCalledWith('device:fingerprint', 'fingerprint-1');

    mockGetSecureItem.mockReturnValue('stored-fingerprint');
    await expect(getDeviceFingerprint()).resolves.toBe('stored-fingerprint');
  });
});
