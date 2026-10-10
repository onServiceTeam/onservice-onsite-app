import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateProject = jest.fn().mockResolvedValue({ id: 'project-897' });
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: mockReplace }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

import NewProjectScreen from '../app/customer/projects/new';

it('Bug UX-897 — a new planning project preserves its site address while keeping the future booking address independent', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewProjectScreen /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('Project title'), { target: { value: 'House repaint plan' } });
  fireEvent.change(screen.getByLabelText('Project description'), { target: { value: 'Plan exterior and interior stages.' } });
  fireEvent.change(screen.getByLabelText('Project address'), { target: { value: '88 A.S. Fortuna Street' } });
  fireEvent.change(screen.getByLabelText('Project city'), { target: { value: 'Mandaue City' } });
  fireEvent.change(screen.getByLabelText('Estimated total budget'), { target: { value: '150000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

  await waitFor(() => expect(mockCreateProject).toHaveBeenCalledWith({
    title: 'House repaint plan',
    description: 'Plan exterior and interior stages.',
    address: '88 A.S. Fortuna Street',
    city: 'Mandaue City',
    estimatedTotal: 15_000_000,
  }));
  expect(screen.getByText(/future booking still confirms its own service address/i)).toBeTruthy();
  expect(mockReplace).toHaveBeenCalledWith('/customer/projects/project-897');
});
