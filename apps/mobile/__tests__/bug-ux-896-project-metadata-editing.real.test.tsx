import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateProject = jest.fn().mockResolvedValue({ id: 'project-896' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-896' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-896', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-896', customerId: 'customer-896', providerId: null, categoryId: null,
    title: 'Kitchen renovation', description: 'Replace cabinets and counters.',
    address: '10 Mango Street', city: 'Cebu City', status: 'planning', estimatedTotal: 12_500_000,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], selections: [], documents: [],
  }),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
  updateMilestone: jest.fn(), addMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-896 — a project owner can review and edit the complete safe planning metadata without gaining status, provider, booking, or money authority', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Project overview')).toBeTruthy();
  expect(screen.getByText('10 Mango Street, Cebu City')).toBeTruthy();
  expect(screen.getByText(/125,000/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit project details' }));

  fireEvent.change(screen.getByLabelText('Edit project title'), { target: { value: 'Kitchen and dining renovation' } });
  fireEvent.change(screen.getByLabelText('Edit project address'), { target: { value: '25 Banilad Road' } });
  fireEvent.change(screen.getByLabelText('Edit project city'), { target: { value: 'Mandaue City' } });
  fireEvent.change(screen.getByLabelText('Edit advisory project budget'), { target: { value: '250000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save project details' }));

  await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledWith('project-896', {
    title: 'Kitchen and dining renovation',
    description: 'Replace cabinets and counters.',
    address: '25 Banilad Road',
    city: 'Mandaue City',
    estimatedTotal: 25_000_000,
  }));
  expect(mockUpdateProject.mock.calls[0]?.[1]).not.toHaveProperty('status');
  expect(mockUpdateProject.mock.calls[0]?.[1]).not.toHaveProperty('providerId');
});
