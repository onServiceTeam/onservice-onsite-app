import React from 'react';
import { render, screen } from '@testing-library/react';
import BookingFormScreen from '../app/customer/booking/form';
import { useBookingStore } from '../src/stores/booking.store';

// D41 Q39 (Ken, 2026-10-18): this old fixed-price screen is used only while
// request-first booking is off; with it on, the screen sends the customer to
// the request form. This test pins the screen in the switched-off state.
jest.mock('@/hooks/useRequestFirstBooking', () => ({
  useRequestFirstBooking: () => false,
  useRequestFirstBookingState: () => ({ requestFirst: false, settled: true }),
}));

describe('Bug UX-607 — customer scheduling rejects an incomplete booking draft', () => {
  it('does not expose schedule and payment controls for a zero-price draft', () => {
    useBookingStore.getState().reset();

    render(<BookingFormScreen />);

    expect(screen.getByText('Booking setup expired')).toBeTruthy();
    expect(screen.getByText('Browse services')).toBeTruthy();
    expect(screen.queryByText(/Proceed to Payment/)).toBeNull();
  });
});
