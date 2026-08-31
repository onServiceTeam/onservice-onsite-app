// B2 — checkout validation no longer uses blocking modal alerts.
//
// A partially completed draft is rejected before payment controls render. The
// recovery is inline and never falls back to a blocking Alert.alert modal.

import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { ToastProvider, useToastStore } from '@/components/ui/Toast';
import { useBookingStore } from '@/stores/booking.store';

jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 0 }),
}));

import CheckoutScreen from '../../app/customer/booking/checkout';

function renderCheckout(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CheckoutScreen),
        React.createElement(ToastProvider),
      ),
    ),
  );
  return { container };
}

beforeEach(() => {
  (Alert.alert as jest.Mock).mockClear();
  act(() => {
    useBookingStore.getState().reset();
    useToastStore.getState().hide();
  });
});

describe('B2 — checkout uses inline/toast validation, not modal alerts', () => {
  it('shows inline recovery without Alert.alert when the booking draft is incomplete', async () => {
    const { container } = renderCheckout();

    await waitFor(() => {
      expect(container.textContent).toContain('Booking details are incomplete');
    });
    expect(container.querySelector('button[aria-label^="Pay"]')).toBeNull();
    // The whole point of B2: no blocking modal alert for this validation.
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
