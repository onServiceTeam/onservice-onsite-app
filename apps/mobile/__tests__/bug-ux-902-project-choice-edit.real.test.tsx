import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateSelection = jest.fn().mockResolvedValue({ id: 'selection-902' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-902' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-902', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-902', customerId: 'customer-902', providerId: null, categoryId: null,
    title: 'Interior plan', description: '', address: null, city: null, status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], documents: [],
    selections: [{ id: 'selection-902', projectId: 'project-902', category: 'Cabinet', label: 'Finish', value: 'Gloss white', detail: null, sortOrder: 0 }],
  }),
  updateSelection: (...args: unknown[]) => mockUpdateSelection(...args),
  updateProject: jest.fn(), addMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(),
  addSelection: jest.fn(), deleteSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-902 — an owner can correct every field of an existing planning choice', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Gloss white')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit choice Cabinet Finish' }));
  fireEvent.change(screen.getByLabelText('Edit choice category'), { target: { value: 'Cabinetry' } });
  fireEvent.change(screen.getByLabelText('Edit choice label'), { target: { value: 'Door finish' } });
  fireEvent.change(screen.getByLabelText('Edit choice value'), { target: { value: 'Matte white' } });
  fireEvent.change(screen.getByLabelText('Edit choice detail'), { target: { value: 'Low-VOC sample MW-04' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save choice details' }));

  await waitFor(() => expect(mockUpdateSelection).toHaveBeenCalledWith('selection-902', {
    category: 'Cabinetry',
    label: 'Door finish',
    value: 'Matte white',
    detail: 'Low-VOC sample MW-04',
  }));
});
