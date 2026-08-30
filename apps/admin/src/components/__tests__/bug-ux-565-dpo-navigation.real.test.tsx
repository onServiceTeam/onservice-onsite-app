import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const testState = vi.hoisted(() => ({
  user: {
    id: 'dpo-1', email: 'dpo@example.test', phone: '+639000000001',
    firstName: 'Privacy', lastName: 'Officer', role: 'dpo' as const, avatarUrl: null,
  },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: { user: typeof testState.user }) => unknown) => {
    const state = { user: testState.user };
    return selector ? selector(state) : state;
  },
}));

import Sidebar from '../Sidebar';

it('Bug UX-565 — DPO navigation exposes only the dedicated privacy workspace', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);

  expect(screen.getByText('Privacy Console')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Privacy Workspace' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Data Protection' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Consent Versions' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Bookings' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Financials' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Compliance' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Staff & Roles' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Breach Response' })).toBeNull();
});
