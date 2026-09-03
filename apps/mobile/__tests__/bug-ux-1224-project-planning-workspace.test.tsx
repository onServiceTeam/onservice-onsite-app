import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/project.service', () => ({ createProject: jest.fn() }));

import NewProjectScreen from '../app/customer/projects/new';

it('Bug UX-1224 — desktop project creation is a bounded workspace that clearly separates planning from hiring and payment', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewProjectScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide project planning form')).toBeTruthy();
  expect(screen.getByText('Planning workspace only')).toBeTruthy();
  expect(screen.getByText(/does not book or assign a provider, and no payment is collected here/i)).toBeTruthy();
  expect(screen.getByPlaceholderText(/planning notes you want to keep/i)).toBeTruthy();
});
