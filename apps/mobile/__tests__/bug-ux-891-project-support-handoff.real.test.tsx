import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: 'project-891' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-891', role: 'customer' } }),
}));
jest.mock('@/services/project.service', () => ({
  getProject: jest.fn().mockResolvedValue({
    id: 'project-891', customerId: 'customer-891', providerId: null, categoryId: null,
    title: 'Kitchen renovation plan', description: 'Plan the work', address: null, city: 'Cebu City',
    status: 'planning', estimatedTotal: null, createdAt: '2026-09-01', updatedAt: '2026-09-01',
    milestones: [], selections: [], documents: [],
  }),
  updateMilestone: jest.fn(), addMilestone: jest.fn(), addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-891 — a customer project opens a pre-contextualized support request without claiming a booking relationship', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Get support for project Kitchen renovation plan' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      projectId: 'project-891',
      projectTitle: 'Kitchen renovation plan',
      type: 'general_inquiry',
      subject: 'Help with Kitchen renovation plan',
    },
  });
});
