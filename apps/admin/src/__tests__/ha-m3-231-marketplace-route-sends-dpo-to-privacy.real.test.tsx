// HA-M3-231 (D38 Milestone 3, split from HA-M3-69): a data protection officer
// who opens /marketplace is sent to /privacy by the admin and super_admin
// route guard (E34) and never sees the Marketplace page. The real App routes
// run; only the page bodies are replaced by markers.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  state: {
    isAuthenticated: true,
    isLoading: false,
    mustRotatePassword: false,
    user: { id: 'user-231', role: 'dpo', firstName: 'Data', lastName: 'Officer', email: null, phone: '', avatarUrl: null },
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

it('HA-M3-231: a dpo who opens /marketplace is sent to the privacy workspace', async () => {
  render(<MemoryRouter initialEntries={['/marketplace']}><App /></MemoryRouter>);
  expect(await screen.findByText('Privacy workspace body')).toBeInTheDocument();
  expect(screen.queryByText('Marketplace page body')).not.toBeInTheDocument();
});
