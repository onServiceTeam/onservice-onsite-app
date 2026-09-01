import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-900' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-900', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-900', customerId: 'customer-900', providerId: null, categoryId: null,
    title: 'House build plan', description: null, address: null, city: null,
    status: 'planning', estimatedTotal: null, createdAt: '2026-09-01', updatedAt: '2026-09-01',
    milestones: [{
      id: 'milestone-900', projectId: 'project-900', title: 'Cabinet installation',
      description: 'Install upper and lower kitchen cabinets.', status: 'pending', sortOrder: 0,
      amount: 1_850_050, targetDate: '2026-10-15', completedAt: null, createdAt: '2026-09-01',
    }],
    selections: [], documents: [],
  }),
  addMilestone: jest.fn(), updateProject: jest.fn(), updateMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-900 — a saved milestone description remains visible in the customer planning record', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Cabinet installation')).toBeTruthy();
  expect(screen.getByText('Install upper and lower kitchen cabinets.')).toBeTruthy();
});
