import React from 'react';
import { render, screen } from '@testing-library/react';
import BookingFormScreen from '../app/customer/booking/form';
import { useBookingStore } from '../src/stores/booking.store';

describe('Bug UX-607 — customer scheduling rejects an incomplete booking draft', () => {
  it('does not expose schedule and payment controls for a zero-price draft', () => {
    useBookingStore.getState().reset();

    render(<BookingFormScreen />);

    expect(screen.getByText('Booking setup expired')).toBeTruthy();
    expect(screen.getByText('Browse services')).toBeTruthy();
    expect(screen.queryByText(/Proceed to Payment/)).toBeNull();
  });
});
