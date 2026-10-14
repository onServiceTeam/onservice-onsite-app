// HA-M3-69 (D38 Milestone 3): App routes /marketplace inside the admin and
// super_admin guard, and an admin who opens /marketplace reaches the
// Marketplace page. The real App routes run; only the page bodies are
// replaced by markers. (The dpo case is HA-M3-231.)
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  state: {
    isAuthenticated: true,
    isLoading: false,
    mustRotatePassword: false,
    user: { id: 'user-69', role: 'admin', firstName: 'Ops', lastName: 'Admin', email: null, phone: '', avatarUrl: null },
    hydrate: async () => undefined,
    logout: async () => undefined,
  },
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => {
  const useAuthStore = (selector?: (state: typeof auth.state) => unknown) => (selector ? selector(auth.state) : auth.state);
  (useAuthStore as unknown as { getState: () => typeof auth.state }).getState = () => auth.state;
  return { useAuthStore };
});
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));
vi.mock('@/components/MarketplaceAlertBanner', () => ({ default: () => null }));
vi.mock('@/pages/MarketplacePage', () => ({ default: () => <p>Marketplace page body</p> }));
vi.mock('@/pages/PrivacyWorkspacePage', () => ({ default: () => <p>Privacy workspace body</p> }));

import App from '../App';

it('HA-M3-69: an admin who opens /marketplace reaches the Marketplace page', async () => {
  render(<MemoryRouter initialEntries={['/marketplace']}><App /></MemoryRouter>);
  expect(await screen.findByText('Marketplace page body')).toBeInTheDocument();
});
