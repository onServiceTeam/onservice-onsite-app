// B2 — checkout validation no longer uses blocking modal alerts.
//
// Reachable validation path: a payment method IS selected (Pay button enabled)
// but the booking draft is incomplete (its fields live on earlier steps, so
// there's nothing to highlight on this screen) -> a single summary TOAST, not
// Alert.alert. Real render test (jsdom + RTL) that drives the actual button.

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
  it('shows a summary toast (not Alert.alert) when the booking draft is incomplete', async () => {
    // Select a method so the Pay button is enabled; leave the draft incomplete.
    act(() => {
    useBookingStore.getState().setPaymentMethod('wallet');
    });

    const { container } = renderCheckout();

    // Target the Pay CTA specifically by its aria-label (= Button title,
    // "Pay ₱..."). The method cards say "Pay with GCash" and have no
    // aria-label, so query by the labelled button to avoid hitting a card.
    const payBtn = await waitFor(() => {
      const button = container.querySelector('button[aria-label^="Pay"]') as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      expect(button!.disabled).toBe(false);
      return button!;
    });

    act(() => {
      payBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Booking details are incomplete');
    });
    // The whole point of B2: no blocking modal alert for this validation.
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
