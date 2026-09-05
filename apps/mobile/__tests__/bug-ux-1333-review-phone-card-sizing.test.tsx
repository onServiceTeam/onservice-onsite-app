import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import Review from '../app/provider-onboarding/review-pending';
import { applicant } from '../test-support/application-draft-fixture';

const mockApplicant = applicant;
let mockIsPhone = true;
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: mockIsPhone }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ user: mockApplicant, isAuthenticated: true }) }));
// Native View flattens style arrays. Mirror that behavior in the DOM primitive
// so assertions inspect the rendered CSS, not source text or array properties.
jest.mock('react-native', () => {
  const native = jest.requireActual('../__mocks__/react-native.js');
  const runtime = require('react') as typeof React;
  return { ...native, View: ({ style, ...props }: { style?: unknown }) => runtime.createElement(native.View, {
    ...props, style: native.StyleSheet.flatten(style),
  }) };
});

it('Bug UX-1333 — phone review cards hug content instead of distributing vertical space while wide cards share horizontal space', async () => {
  jest.mocked(api.get).mockResolvedValue({ status: 200, ok: true, data: { success: true, data: { status: 'pending', rejectionReason: null } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  const decision = (await screen.findByText('Application submitted')).parentElement!;
  const help = screen.getByText('Review and support').parentElement!;
  expect(decision.style.flexGrow).toBe('');
  expect(help.style.flexGrow).toBe('');
  mockIsPhone = false;
  view.rerender(<QueryClientProvider client={client}><Review /></QueryClientProvider>);
  expect(decision.style.flexGrow).toBe('1.2');
  expect(help.style.flexGrow).toBe('1');
  view.unmount();
  client.clear();
});
