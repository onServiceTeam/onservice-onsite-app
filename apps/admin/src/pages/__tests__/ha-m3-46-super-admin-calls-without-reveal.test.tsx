// HA-M3-46 (D38 Milestone 3): a super_admin already receives the raw provider
// number (D25), so "Who was notified" offers the tel: link straight away and
// never calls the reveal route (no extra audit row for a number already
// shown).
import React from 'react';
import { screen } from '@testing-library/react';
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

it('HA-M3-46: with an unmasked number (super_admin) the tel: link shows at once and reveal-contact is never called', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/bookings/booking-46/invites`) {
      return invitesResponse([
        invite({
          inviteId: 'invite-1',
          providerId: 'provider-46',
          providerName: 'Lito Ramos Plumbing',
          phone: '+639181112233',
          contactMasked: false,
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<InvitedProvidersList bookingId="booking-46" />);

  const call = await screen.findByRole('link', { name: 'Call Lito Ramos Plumbing on +639181112233' });
  expect(call).toHaveAttribute('href', 'tel:+639181112233');
  expect(screen.queryByRole('button', { name: /Call provider/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Shown to you only. This was logged.')).not.toBeInTheDocument();
  expect(apiMocks.post).not.toHaveBeenCalled();
});
