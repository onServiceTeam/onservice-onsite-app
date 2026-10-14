// HA-M3-230 (D38 Milestone 3, split from HA-M3-68): a data protection officer
// does not see Marketplace in the sidebar (E34: dpo has no marketplace
// access), while the sidebar itself still renders for them.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'user-230', role: 'dpo' } };
    return selector ? selector(state) : state;
  },
}));

import Sidebar from '../Sidebar';

it('HA-M3-230: the sidebar has no Marketplace link for a dpo', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  const navigation = screen.getByRole('navigation', { name: 'Admin workspace' });
  expect(within(navigation).getAllByRole('link').length).toBeGreaterThan(0);
  expect(within(navigation).queryByRole('link', { name: 'Marketplace' })).not.toBeInTheDocument();
});
