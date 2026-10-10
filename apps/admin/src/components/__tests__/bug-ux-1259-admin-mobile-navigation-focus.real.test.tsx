import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const authState = {
  user: {
    id: 'admin-1259',
    email: 'admin@example.test',
    phone: '+630000000000',
    firstName: 'Operations',
    lastName: 'Admin',
    role: 'super_admin' as const,
    avatarUrl: null,
  },
};

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

import Sidebar from '../Sidebar';

describe('admin mobile navigation accessibility', () => {
  it('Bug UX-1259 — the open tablet drawer owns focus, traps Tab, and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar mobileOpen onClose={onClose} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Admin workspace navigation' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const closeButton = within(dialog).getByRole('button', { name: 'Close navigation' });
    expect(document.activeElement).toBe(closeButton);

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
    const lastFocusable = focusable[focusable.length - 1];
    expect(lastFocusable).toBeTruthy();
    lastFocusable?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
