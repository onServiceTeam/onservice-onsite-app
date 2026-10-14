// HA-M3-219 (D38 Milestone 3, review gap): when the server says nobody was
// told about a quote request, "Who was notified" says so in words ("No
// provider has been notified about this request, and none has opened it from
// their list.") and shows no table and no error.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { InvitedProvidersList } from '@/components/marketplace/InvitedProvidersList';
import { MARKETPLACE, invitesResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-219: a quote request with no notified provider says that nobody was notified', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/bookings/booking-219/invites`) return invitesResponse([], { applicable: true, currentRound: 1 });
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<InvitedProvidersList bookingId="booking-219" />);

  expect(
    await screen.findByText('No provider has been notified about this request, and none has opened it from their list.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByText('Notified providers could not be loaded.')).not.toBeInTheDocument();
});
