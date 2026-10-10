import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';

const mockUploadProjectDocument = jest.fn().mockResolvedValue({ id: 'document-906' });
const mockGetProjectDocumentAccess = jest.fn().mockResolvedValue({
  url: 'https://api.example.test/api/v1/projects/documents/document-existing/file?expires=123&token=signed',
  expiresInSeconds: 120,
});
const mockLaunchImageLibraryAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [{ uri: 'blob:https://app.example.test/private-plan' }],
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'project-906' }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-906', role: 'customer' } }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/project.service', () => ({
  PROJECT_ADVISORY_BUDGET_MAX_PESOS: 20_000_000,
  getProject: jest.fn().mockResolvedValue({
    id: 'project-906', customerId: 'customer-906', providerId: null, categoryId: null,
    title: 'Private renovation plan', description: '', address: null, city: 'Cebu City', status: 'planning', estimatedTotal: null,
    createdAt: '2026-09-01', updatedAt: '2026-09-01', milestones: [], selections: [],
    documents: [{ id: 'document-existing', projectId: 'project-906', label: 'Existing permit image', fileUrl: null, accessPath: '/api/v1/projects/documents/document-existing/access', docType: 'permit', uploadedBy: 'customer-906', createdAt: '2026-09-01' }],
  }),
  uploadProjectDocument: (...args: unknown[]) => mockUploadProjectDocument(...args),
  getProjectDocumentAccess: (...args: unknown[]) => mockGetProjectDocumentAccess(...args),
  updateProject: jest.fn(), addMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(),
  addSelection: jest.fn(), updateSelection: jest.fn(), deleteSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-906 — a customer can attach one typed private planning image and opens existing evidence through a signed link', async () => {
  const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Existing permit image')).toBeTruthy();
  expect(screen.getByText('Permit')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show attach planning image form' }));
  fireEvent.change(screen.getByLabelText('Planning image label'), { target: { value: 'Ground-floor plan' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Planning image type Plan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose planning image' }));
  expect(await screen.findByLabelText('Selected planning image preview')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Attach private planning image' }));

  await waitFor(() => expect(mockUploadProjectDocument).toHaveBeenCalledWith('project-906', {
    label: 'Ground-floor plan',
    docType: 'blueprint',
    uri: 'blob:https://app.example.test/private-plan',
  }));

  fireEvent.click(screen.getByRole('link', { name: 'Open project document Existing permit image' }));
  await waitFor(() => expect(mockGetProjectDocumentAccess).toHaveBeenCalledWith('document-existing'));
  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('token=signed'));
  openSpy.mockRestore();
});
