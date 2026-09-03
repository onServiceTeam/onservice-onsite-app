import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateMilestone = jest.fn().mockResolvedValue({});

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
    id: 'project-1', customerId: 'customer-1', providerId: null, categoryId: null,
    title: 'Kitchen plan', description: 'Plan the renovation', address: null, city: 'Cebu City',
    status: 'planning', estimatedTotal: 100_000, createdAt: '2026-08-24', updatedAt: '2026-08-24',
    milestones: [
      { id: 'done-1', projectId: 'project-1', title: 'Measure room', description: '', sortOrder: 0, status: 'completed', amount: null, targetDate: null, completedAt: '2026-08-23', createdAt: '2026-08-22' },
      { id: 'active-1', projectId: 'project-1', title: 'Choose cabinets', description: '', sortOrder: 1, status: 'in_progress', amount: null, targetDate: null, completedAt: null, createdAt: '2026-08-22' },
    ],
    selections: [], documents: [],
  }),
  updateMilestone: (...args: unknown[]) => mockUpdateMilestone(...args),
  addMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-1225 — completed project milestones cannot be reset by a generic tap and active milestones use an explicit forward action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide project planning workspace')).toBeTruthy();
  expect(screen.queryByLabelText('Mark Measure room in progress')).toBeNull();
  expect(screen.queryByLabelText('Mark Measure room complete')).toBeNull();
  fireEvent.click(screen.getByLabelText('Mark Choose cabinets complete'));
  await waitFor(() => expect(mockUpdateMilestone).toHaveBeenCalledWith('active-1', { status: 'completed' }));
  expect(mockUpdateMilestone).not.toHaveBeenCalledWith('done-1', expect.anything());
});
