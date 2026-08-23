import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-staff.service', () => ({
  getMyInvites: jest.fn().mockResolvedValue([]),
  acceptInvite: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import StaffInvitesScreen from '../app/staff/invites';

it('Bug UX-090 — staff invitations use a bounded multi-column workspace on tablet and desktop browsers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <StaffInvitesScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('No invitations'));
  expect(container.querySelector(
    '[aria-label="Tablet and desktop team invitations workspace"]',
  )).not.toBeNull();
});
