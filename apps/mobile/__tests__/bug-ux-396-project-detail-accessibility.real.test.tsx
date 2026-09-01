import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';

const mockGetProjectDocumentAccess = jest.fn().mockResolvedValue({
  url: 'https://api.example.test/api/v1/projects/documents/doc-1/file?expires=123&token=signed',
  expiresInSeconds: 120,
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1' } }),
}));
jest.mock('@/services/project.service', () => ({
  getProject: jest.fn().mockResolvedValue({
    id: 'project-1', customerId: 'customer-1', providerId: null, categoryId: null,
    title: 'House handover', description: 'Plan final work', address: null, city: 'Mandaue City',
    status: 'planning', estimatedTotal: 500_000, createdAt: '2026-08-25', updatedAt: '2026-08-25',
    milestones: [], selections: [],
    documents: [{ id: 'doc-1', projectId: 'project-1', label: 'Floor plan', docType: 'blueprint', fileUrl: null, accessPath: '/api/v1/projects/documents/doc-1/access', createdAt: '2026-08-25' }],
  }),
  getProjectDocumentAccess: (...args: unknown[]) => mockGetProjectDocumentAccess(...args),
  uploadProjectDocument: jest.fn(),
  updateMilestone: jest.fn(), addMilestone: jest.fn().mockResolvedValue({}), addSelection: jest.fn().mockResolvedValue({}),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-396 — project planning controls expose their names, disclosure state, fields, and document destination', async () => {
  const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide project planning workspace')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go back from project' })).toBeTruthy();

  const choiceDisclosure = screen.getByRole('button', { name: 'Show add choice form' });
  fireEvent.click(choiceDisclosure);
  expect(screen.getByRole('button', { name: 'Hide add choice form' })).toBeTruthy();
  expect(screen.getByLabelText('Choice category')).toBeTruthy();
  expect(screen.getByLabelText('Choice label')).toBeTruthy();
  expect(screen.getByLabelText('Choice value')).toBeTruthy();
  expect(screen.getByLabelText('Choice detail')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add project choice' }).hasAttribute('disabled')).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Show add milestone form' }));
  expect(screen.getByLabelText('Milestone title')).toBeTruthy();
  expect(screen.getByLabelText('Milestone description')).toBeTruthy();
  expect(screen.getByLabelText('Milestone advisory budget')).toBeTruthy();
  expect(screen.getByLabelText('Milestone planning target date')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add project milestone' }).hasAttribute('disabled')).toBe(true);

  fireEvent.click(screen.getByRole('link', { name: 'Open project document Floor plan' }));
  await waitFor(() => expect(mockGetProjectDocumentAccess).toHaveBeenCalledWith('doc-1'));
  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('token=signed'));
  openSpy.mockRestore();
});
