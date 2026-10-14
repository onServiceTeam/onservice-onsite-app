// HA-M3-218 (D38 Milestone 3, review gap): when the notified providers cannot
// be loaded, "Who was notified" says "Notified providers could not be loaded"
// with the reason, never "No provider has been notified", and Retry asks
// again and lists them.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { InvitedProvidersList } from '@/components/marketplace/InvitedProvidersList';
import {
  MARKETPLACE, invite, invitesResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-218: a failed notified-providers load shows an error with Retry, and Retry lists the providers', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/bookings/booking-218/invites`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) throw new Error('Database timeout');
    return invitesResponse([invite({ inviteId: 'invite-218', providerId: 'provider-a', providerName: 'Ramon Cruz Aircon' })]);
  });

  renderWithProviders(<InvitedProvidersList bookingId="booking-218" />);

  expect(await screen.findByText('Notified providers could not be loaded.')).toBeInTheDocument();
  expect(screen.getByText('Database timeout')).toBeInTheDocument();
  expect(screen.queryByText(/No provider has been notified/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByText('Ramon Cruz Aircon')).toBeInTheDocument();
  expect(calls).toBe(2);
});
