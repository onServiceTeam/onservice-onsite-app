import { it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login: vi.fn() }),
}));

import LoginPage from '../LoginPage';

it('Bug UX-026 — admin sign-in presents a company operations context and dedicated authentication workspace', () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  const context = screen.getByLabelText('onService operations context');
  const workspace = screen.getByLabelText('Admin authentication workspace');
  const form = screen.getByRole('heading', { name: 'Sign in to onService' }).closest('form');

  expect(context.textContent).toContain('Booking, dispatch, and support context in one place');
  expect(workspace.textContent).toContain('manage customers, providers, bookings, support, and company operations');
  expect(form).not.toBeNull();
  expect(workspace.contains(form)).toBe(true);
});
