import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDeleteSelection = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-905' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-905', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-905', customerId: 'customer-905', providerId: null, categoryId: null,
    title: 'Interior plan', description: '', address: null, city: null, status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], documents: [],
    selections: [{ id: 'selection-905', projectId: 'project-905', category: 'Door', label: 'Material', value: 'Oak', detail: null, sortOrder: 0 }],
  }),
  deleteSelection: (...args: unknown[]) => mockDeleteSelection(...args),
  updateProject: jest.fn(), addMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(),
  addSelection: jest.fn(), updateSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-905 — removing a planning choice requires an explicit irreversible-action confirmation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Oak')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove choice Door Material' }));
  expect(screen.getByText('Remove planning choice?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove choice' }));

  await waitFor(() => expect(mockDeleteSelection).toHaveBeenCalledWith('selection-905'));
});
