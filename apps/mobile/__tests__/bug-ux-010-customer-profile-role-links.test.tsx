import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from '../app/(tabs)/profile';

it('Bug UX-010 — keeps provider-staff invitations out of the customer profile', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByText('Help & Support')).toBeTruthy();
  expect(screen.getByText('Account & Data')).toBeTruthy();
  expect(screen.queryByText('Team Invitations')).toBeNull();
});
