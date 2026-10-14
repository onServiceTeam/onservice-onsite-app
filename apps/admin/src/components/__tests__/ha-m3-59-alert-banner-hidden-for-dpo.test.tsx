// HA-M3-59 (D38 Milestone 3): the data protection officer has no access to
// marketplace operations (E34; the API answers 403). For a dpo the banner
// renders nothing and never asks the server.
import React from 'react';
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const auth = vi.hoisted(() => ({
  state: {
    isAuthenticated: true,
    mustRotatePassword: false,
    user: { id: 'dpo-1', role: 'dpo', firstName: 'Privacy', lastName: 'Officer' },
  },
}));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: typeof auth.state) => unknown) => (selector ? selector(auth.state) : auth.state),
}));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import { renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-59: for a dpo the alert banner renders nothing and requests nothing', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [], meta: { openCount: 3 } } });

  const { container } = renderWithProviders(<MarketplaceAlertBanner />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(container).toBeEmptyDOMElement();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
