// HA-M3-68 (D38 Milestone 3): for an admin the sidebar lists Marketplace
// under Operations, right after Dispatch, linking to /marketplace. (The dpo
// case is HA-M3-230.)
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'user-68', role: 'admin' } };
    return selector ? selector(state) : state;
  },
}));

import Sidebar from '../Sidebar';

it('HA-M3-68: the sidebar shows Marketplace right after Dispatch for an admin', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  const navigation = screen.getByRole('navigation', { name: 'Admin workspace' });
  const marketplace = within(navigation).getByRole('link', { name: 'Marketplace' });
  expect(marketplace).toHaveAttribute('href', '/marketplace');
  const links = within(navigation).getAllByRole('link').map((link) => link.textContent?.trim());
  expect(links.indexOf('Marketplace')).toBe(links.indexOf('Dispatch') + 1);
});
