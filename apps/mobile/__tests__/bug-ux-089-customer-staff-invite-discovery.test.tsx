import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from '../app/(tabs)/profile';

it('Bug UX-089 — customer profile exposes the decided provider-staff invitation discovery route', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByText('Team Invitations')).toBeTruthy();
  expect(screen.getByText('Help & Support')).toBeTruthy();
  expect(screen.getByText('Account & Data')).toBeTruthy();
});
