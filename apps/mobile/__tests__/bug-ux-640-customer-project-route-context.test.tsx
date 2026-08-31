import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetProject = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/project.service', () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
  addMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  addSelection: jest.fn(),
}));

import ProjectDetailScreen from '../app/customer/projects/[id]';

it('Bug UX-640 — a project link without an ID fails explicitly instead of showing a retry for an impossible request', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);

  expect(screen.getByText('Project unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a project/i)).toBeTruthy();
  expect(mockGetProject).not.toHaveBeenCalled();
});
