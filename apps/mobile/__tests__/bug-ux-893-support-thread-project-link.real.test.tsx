import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: '89300000-abcd-4abc-8def-000000000893' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-893', role: 'customer' } }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: {
      id: '89300000-abcd-4abc-8def-000000000893', ticket_number: 'TKT-1893', type: 'general_inquiry', status: 'open', priority: 'medium',
      subject: 'Kitchen planning help', description: 'Please review this project.', booking_id: null,
      project_id: 'project-893', project_title: 'Kitchen renovation plan',
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', messages: [],
    } } }),
    post: jest.fn(),
  },
}));

import SupportThreadScreen, { getSupportProjectRoute } from '../app/support/[id]';

it('Bug UX-893 — a customer support thread returns to its exact related planning project and never exposes that route to provider roles', async () => {
  expect(getSupportProjectRoute('customer', 'project-893')).toBe('/customer/projects/project-893');
  expect(getSupportProjectRoute('provider', 'project-893')).toBeNull();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  const relatedProject = await screen.findByRole('button', { name: 'Open related project' });
  expect(screen.getByText('Kitchen renovation plan')).toBeTruthy();
  fireEvent.click(relatedProject);
  expect(mockPush).toHaveBeenCalledWith('/customer/projects/project-893');
});
