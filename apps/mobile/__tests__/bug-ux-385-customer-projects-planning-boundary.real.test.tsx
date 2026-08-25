import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/project.service', () => ({
  listProjects: jest.fn().mockResolvedValue([{
    id: 'project-1', customerId: 'customer-1', providerId: null, categoryId: null,
    title: 'New house handover', description: 'Track finishing and final cleaning', address: null,
    city: 'Mandaue City', status: 'planning', estimatedTotal: 5000000,
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
  }]),
}));

import ProjectsListScreen from '../app/customer/projects';

it('Bug UX-385 — the populated project list keeps its planning-only boundary visible before project records', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProjectsListScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Project planning overview')).toBeTruthy();
  expect(screen.getByText(/not a provider assignment, quote, booking, or payment/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open project New house handover' })).toBeTruthy();
});
