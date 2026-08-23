import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]),
  inviteStaff: jest.fn(),
  removeStaff: jest.fn(),
  submitStaffForReview: jest.fn(),
  staffStatusLabel: (status: string) => status,
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import ProviderTeamScreen from '../app/provider/team';

it('Bug UX-082 — provider team exposes the split management workspace on tablet and desktop widths', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ProviderTeamScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('No team members yet'));
  expect(container.querySelector(
    '[aria-label="Tablet and desktop team management workspace"]',
  )).not.toBeNull();
  expect(container.textContent).toContain('Invite a team member');
  expect(container.textContent).toContain('Team members (0)');
});
