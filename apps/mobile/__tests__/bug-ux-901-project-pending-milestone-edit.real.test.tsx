import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateMilestone = jest.fn().mockResolvedValue({ id: 'milestone-901' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-901' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-901', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-901', customerId: 'customer-901', providerId: null, categoryId: null,
    title: 'House plan', description: '', address: null, city: null, status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', selections: [], documents: [],
    milestones: [
      { id: 'milestone-901', projectId: 'project-901', title: 'Foundation', description: 'Original scope', sortOrder: 0, status: 'pending', amount: 1000000, targetDate: '2026-10-01', completedAt: null, createdAt: '2026-09-01' },
      { id: 'milestone-started', projectId: 'project-901', title: 'Framing', description: '', sortOrder: 1, status: 'in_progress', amount: null, targetDate: null, completedAt: null, createdAt: '2026-09-01' },
    ],
  }),
  updateMilestone: (...args: unknown[]) => mockUpdateMilestone(...args),
  updateProject: jest.fn(), addMilestone: jest.fn(), deleteMilestone: jest.fn(), addSelection: jest.fn(),
  updateSelection: jest.fn(), deleteSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-901 — an owner can edit pending milestone planning details without rewriting progress or booking authority', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Foundation')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit milestone Framing' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit milestone Foundation' }));
  fireEvent.change(screen.getByLabelText('Edit milestone title'), { target: { value: 'Foundation inspection' } });
  fireEvent.change(screen.getByLabelText('Edit milestone description'), { target: { value: 'Confirm reinforcement and pour notes.' } });
  fireEvent.change(screen.getByLabelText('Edit milestone advisory budget'), { target: { value: '15000' } });
  fireEvent.change(screen.getByLabelText('Edit milestone planning target date'), { target: { value: '2026-02-31' } });
  expect(screen.getByRole('button', { name: 'Save milestone details' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Edit milestone planning target date'), { target: { value: '2026-10-12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save milestone details' }));

  await waitFor(() => expect(mockUpdateMilestone).toHaveBeenCalledWith('milestone-901', {
    title: 'Foundation inspection',
    description: 'Confirm reinforcement and pour notes.',
    amount: 1_500_000,
    targetDate: '2026-10-12',
  }));
  expect(mockUpdateMilestone.mock.calls[0]?.[1]).not.toHaveProperty('status');
  expect(mockUpdateMilestone.mock.calls[0]?.[1]).not.toHaveProperty('bookingId');
});
