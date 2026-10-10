import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1' } }),
}));
jest.mock('@/services/project.service', () => ({
  getProject: jest.fn().mockResolvedValue({
    id: 'project-1', customerId: 'customer-1', providerId: 'provider-1', categoryId: null,
    title: 'Roof redesign', description: 'Plan the work', address: null, city: 'Mandaue City',
    status: 'planning', estimatedTotal: null, createdAt: '2026-08-01', updatedAt: '2026-08-01',
    milestones: [], selections: [], documents: [],
  }),
  updateMilestone: jest.fn(), addMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-883 — a customer project with a legacy provider link does not falsely claim that no provider link exists', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText(/has a legacy provider link/i)).toBeTruthy();
  expect(screen.queryByText(/has no provider or payment link/i)).toBeNull();
});
