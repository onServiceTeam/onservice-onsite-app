import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDeleteMilestone = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-904' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-904', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-904', customerId: 'customer-904', providerId: null, categoryId: null,
    title: 'House plan', description: '', address: null, city: null, status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', selections: [], documents: [],
    milestones: [
      { id: 'pending-904', projectId: 'project-904', title: 'Pending draft', description: '', sortOrder: 0, status: 'pending', amount: null, targetDate: null, completedAt: null, createdAt: '2026-09-01' },
      { id: 'started-904', projectId: 'project-904', title: 'Started history', description: '', sortOrder: 1, status: 'in_progress', amount: null, targetDate: null, completedAt: null, createdAt: '2026-09-01' },
    ],
  }),
  deleteMilestone: (...args: unknown[]) => mockDeleteMilestone(...args),
  updateProject: jest.fn(), addMilestone: jest.fn(), updateMilestone: jest.fn(), addSelection: jest.fn(),
  updateSelection: jest.fn(), deleteSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-904 — pending milestone removal requires confirmation while started history has no destructive control', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Pending draft')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove milestone Started history' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove milestone Pending draft' }));
  expect(screen.getByText('Remove pending milestone?')).toBeTruthy();
  expect(screen.getByText(/does not cancel any booking or payment/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove milestone' }));

  await waitFor(() => expect(mockDeleteMilestone).toHaveBeenCalledWith('pending-904'));
});
