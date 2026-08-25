import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authState = {
  user: {
    id: 'admin-1',
    email: 'admin@example.test',
    phone: '+630000000000',
    firstName: 'Operations',
    lastName: 'Admin',
    role: 'super_admin' as const,
    avatarUrl: null,
  },
  logout: vi.fn(),
};

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

import Header from '../Header';

describe('admin header access', () => {
  it('Bug UX-405 — keyboard search, Philippine time, and account actions remain directly available', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    const search = screen.getByRole('textbox', { name: 'Jump to an admin page' });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(search);
    expect(screen.getByLabelText(/Philippine time/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open admin account menu' }));
    expect(screen.getByRole('button', { name: /System settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Change password/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log out/i })).toBeTruthy();
  });
});
