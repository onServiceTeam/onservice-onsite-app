import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAddSelection = jest.fn().mockResolvedValue({ id: 'selection-899' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-899' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-899', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-899', customerId: 'customer-899', providerId: null, categoryId: null,
    title: 'Interior finish plan', description: 'Record final material decisions.', address: null,
    city: 'Cebu City', status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], selections: [], documents: [],
  }),
  addSelection: (...args: unknown[]) => mockAddSelection(...args),
  updateProject: jest.fn(), updateMilestone: jest.fn(), addMilestone: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-899 — an owner can preserve the optional detail and deterministic order of a project material choice', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Interior finish plan')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show add choice form' }));
  fireEvent.change(screen.getByLabelText('Choice category'), { target: { value: 'Cabinetry' } });
  fireEvent.change(screen.getByLabelText('Choice label'), { target: { value: 'Door finish' } });
  fireEvent.change(screen.getByLabelText('Choice value'), { target: { value: 'Warm white' } });
  fireEvent.change(screen.getByLabelText('Choice detail'), { target: { value: 'Matte finish, supplier sample C-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add project choice' }));

  await waitFor(() => expect(mockAddSelection).toHaveBeenCalledWith('project-899', {
    category: 'Cabinetry',
    label: 'Door finish',
    value: 'Warm white',
    detail: 'Matte finish, supplier sample C-14',
    sortOrder: 0,
  }));
});
