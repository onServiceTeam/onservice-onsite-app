// HA-M3-45 (D38 Milestone 3): from a Waiting now row an admin opens the
// providers who were told about the request and presses "Call provider". The
// page asks the existing audit-logged POST
// /api/v1/admin/providers/:id/reveal-contact and only then offers a tel:
// link with the full number. The masked number is what shows before; the
// e-mail that the reveal route also returns is never shown.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import { WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import {
  MARKETPLACE, invite, invitesResponse, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-45: Call provider posts to the audit-logged reveal-contact route and then shows a tel: link', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([openRequest({ bookingId: 'booking-45' })]);
    }
    if (url === `${MARKETPLACE}/bookings/booking-45/invites`) {
      return invitesResponse([
        invite({
          inviteId: 'invite-1',
          providerId: 'provider-45',
          providerName: 'Ramon Cruz Aircon',
          status: 'viewed',
          viewedAt: '2026-10-14T02:03:00.000Z',
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  apiMocks.post.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/providers/provider-45/reveal-contact') {
      return { data: { success: true, data: { phone: '+639171234567', email: 'ramon@example.invalid' } } };
    }
    throw new Error(`Unexpected POST ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  fireEvent.click(await screen.findByRole('button', { name: 'Show providers and call' }));
  expect(await screen.findByText('+63 9XX XXX 4567')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Call Ramon Cruz Aircon/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Call provider Ramon Cruz Aircon' }));

  const call = await screen.findByRole('link', { name: 'Call Ramon Cruz Aircon on +639171234567' });
  expect(call).toHaveAttribute('href', 'tel:+639171234567');
  expect(apiMocks.post).toHaveBeenCalledTimes(1);
  expect(apiMocks.post).toHaveBeenCalledWith('/api/v1/admin/providers/provider-45/reveal-contact', {});
  expect(screen.getByText('Shown to you only. This was logged.')).toBeInTheDocument();
  expect(screen.queryByText('ramon@example.invalid')).not.toBeInTheDocument();
});
