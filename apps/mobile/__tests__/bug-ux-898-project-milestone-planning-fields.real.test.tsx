import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAddMilestone = jest.fn().mockResolvedValue({ id: 'milestone-898' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-898' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-898', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-898', customerId: 'customer-898', providerId: null, categoryId: null,
    title: 'House build plan', description: 'Plan the handover stages.', address: null,
    city: 'Mandaue City', status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], selections: [], documents: [],
  }),
  addMilestone: (...args: unknown[]) => mockAddMilestone(...args),
  updateProject: jest.fn(), updateMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-898 — an owner can add complete milestone planning context while an impossible date and execution or money authority remain blocked', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('House build plan')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show add milestone form' }));
  fireEvent.change(screen.getByLabelText('Milestone title'), { target: { value: 'Final cleaning' } });
  fireEvent.change(screen.getByLabelText('Milestone description'), { target: { value: 'Confirm the site is ready for handover.' } });
  fireEvent.change(screen.getByLabelText('Milestone advisory budget'), { target: { value: '125000' } });
  fireEvent.change(screen.getByLabelText('Milestone planning target date'), { target: { value: '2026-02-31' } });

  expect(screen.getByText('Enter a real date in YYYY-MM-DD format.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add project milestone' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Milestone planning target date'), { target: { value: '2026-10-15' } });
  expect(screen.getByText(/does not authorize a quote, charge, escrow hold, or payment/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add project milestone' }));

  await waitFor(() => expect(mockAddMilestone).toHaveBeenCalledWith('project-898', {
    title: 'Final cleaning',
    description: 'Confirm the site is ready for handover.',
    sortOrder: 0,
    amount: 12_500_000,
    targetDate: '2026-10-15',
  }));
  expect(mockAddMilestone.mock.calls[0]?.[1]).not.toHaveProperty('status');
  expect(mockAddMilestone.mock.calls[0]?.[1]).not.toHaveProperty('bookingId');
});
