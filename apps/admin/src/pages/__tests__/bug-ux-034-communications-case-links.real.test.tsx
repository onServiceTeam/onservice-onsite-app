import { beforeEach, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

beforeEach(mockCommunicationsApi);

it('Bug UX-034 — a moderated conversation links to its booking, customer, and provider case records', async () => {
  renderCommunicationsPage();
  fireEvent.click((await screen.findByText('Please pay me outside the app.')).closest('button')!);

  const customerLink = (await screen.findAllByText('Maria Santos')).find((node) => node.closest('a'))?.closest('a');
  const providerLink = screen.getByText('Roberto Villanueva').closest('a');
  const bookingLink = screen.getByText('Booking booking-').closest('a');

  // The shared Vitest router mock preserves React Router's `to` target on its
  // rendered anchor, so these assertions verify the actual case destinations.
  expect(customerLink).toHaveAttribute('to', '/customers/customer-1');
  expect(providerLink).toHaveAttribute('to', '/providers/provider-1');
  expect(bookingLink).toHaveAttribute('to', '/bookings/booking-1');
});
