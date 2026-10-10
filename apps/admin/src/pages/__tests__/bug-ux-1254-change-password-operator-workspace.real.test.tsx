import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();
const clearMustRotateMock = vi.fn();
const navigateMock = vi.fn();
const storeState = {
  mustRotatePassword: false,
  clearMustRotate: clearMustRotateMock,
};

vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => storeState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import ChangePasswordPage from '../ChangePasswordPage';

beforeEach(() => {
  apiPostMock.mockReset();
  apiPostMock.mockResolvedValue({ data: { success: true } });
  clearMustRotateMock.mockReset();
  navigateMock.mockReset();
  storeState.mustRotatePassword = false;
});

describe('Admin password operator workspace', () => {
  it('Bug UX-1254 - explains session impact and waits for the operator before leaving success', async () => {
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('complementary', { name: 'Password change impact' })).toBeTruthy();
    expect(screen.getByText(/This browser stays signed in with a replacement session/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel and return' })).toBeTruthy();

    const current = screen.getByLabelText(/Current password/i);
    const next = screen.getByLabelText(/^New password/i);
    const confirm = screen.getByLabelText(/Confirm new password/i);
    expect(current.getAttribute('aria-required')).toBe('true');
    expect(next.getAttribute('aria-required')).toBe('true');
    expect(confirm.getAttribute('aria-required')).toBe('true');

    fireEvent.change(current, { target: { value: 'current-password-2026' } });
    fireEvent.change(next, { target: { value: 'replacement-password-2026' } });
    fireEvent.change(confirm, { target: { value: 'replacement-password-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password updated' })).toBeTruthy());
    expect(clearMustRotateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Existing bookings, support cases, assignments, permissions/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to operations' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
