import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockInviteStaff = jest.fn().mockResolvedValue({ id: 'staff-1' });
const mockShowToast = jest.fn();

jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]),
  inviteStaff: (...args: unknown[]) => mockInviteStaff(...args),
  removeStaff: jest.fn(),
  submitStaffForReview: jest.fn(),
  staffStatusLabel: (status: string) => status,
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ProviderTeamScreen from '../app/provider/team';

function renderScreen(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ProviderTeamScreen />
    </QueryClientProvider>,
  );
}

it('Bug UX-081 — provider team form blocks garbage contacts and sends normalized bounded invite values', async () => {
  const view = renderScreen();
  await waitFor(() => expect(view.container.textContent).toContain('No team members yet'));

  const phone = view.getByLabelText('Team member phone number');
  const email = view.getByLabelText('Team member email address');
  const role = view.getByLabelText('Team member role');
  const send = Array.from(view.container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('Send Invite'),
  );
  expect(send).toBeTruthy();

  fireEvent.change(phone, { target: { value: 'garbage' } });
  fireEvent.click(send!);
  expect(mockInviteStaff).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledWith(
    'Enter a valid PH mobile number, such as +63 917 123 4567.',
    'warning',
  );

  fireEvent.change(phone, { target: { value: '0917 123 4567' } });
  fireEvent.change(email, { target: { value: 'TEAM.Member@Example.COM' } });
  fireEvent.change(role, { target: { value: 'Aircon technician' } });
  fireEvent.click(send!);

  await waitFor(() => expect(mockInviteStaff).toHaveBeenCalled());
  expect(mockInviteStaff.mock.calls[0]?.[0]).toEqual({
    phone: '+639171234567',
    email: 'team.member@example.com',
    roleTitle: 'Aircon technician',
  });
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
    'Invitation created. Ask them to sign in with that phone or email and open Team Invitations. onService reviews them before job assignment.',
    'success',
  ));
});
