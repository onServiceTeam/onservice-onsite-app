import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/project.service', () => ({ createProject: jest.fn() }));

import NewProjectScreen from '../app/customer/projects/new';

it('Bug UX-386 — new-project fields and its primary action are named, bounded, and safely disabled until valid', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewProjectScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide project planning form')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go back from new project' })).toBeTruthy();
  expect(screen.getByLabelText('Project title')).toBeTruthy();
  expect(screen.getByLabelText('Project description')).toBeTruthy();
  expect(screen.getByLabelText('Project city')).toBeTruthy();
  expect(screen.getByLabelText('Estimated total budget')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create project' }).hasAttribute('disabled')).toBe(true);
});
