import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockTopUpWallet = jest.fn();
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 12500 }),
  topUpWallet: (...args: unknown[]) => mockTopUpWallet(...args),
}));

import WalletTopUpScreen from '../app/customer/wallet-topup';

describe('OPS-213 — wallet top-up screen is honest while E14 is open', () => {
  it('shows the temporary hold and exposes no amount or payment submission control', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      React.createElement(QueryClientProvider, { client }, React.createElement(WalletTopUpScreen)),
    );

    await waitFor(() => expect(container.textContent).toContain('Wallet top-ups are temporarily unavailable'));
    expect(container.textContent).toContain('No payment has been created');
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('button')).some((button) => /Add .*Wallet/i.test(button.textContent ?? ''))).toBe(false);
    expect(mockTopUpWallet).not.toHaveBeenCalled();
  });
});
