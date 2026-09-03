import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();
const loginMock = vi.fn();

vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login: loginMock }),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') },
}));

import LoginPage from '../LoginPage';

it('Bug UX-1023 — an admin can choose a recovery code and submit the exact backup-code login contract', async () => {
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requires2FA: true, preAuthToken: 'pre-auth-token' } } };
    }
    if (url === '/api/v1/auth/admin/2fa/verify') {
      return {
        data: {
          data: {
            user: {
              id: 'admin-1023',
              email: 'admin@onservice.ph',
              phone: '+639171234567',
              firstName: 'Admin',
              lastName: 'Operator',
              role: 'admin',
              avatarUrl: null,
            },
            backupCodesRemaining: 7,
          },
        },
      };
    }
    throw new Error(`Unexpected API call: ${url}`);
  });

  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'admin@onservice.ph' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  const recoveryChoice = await screen.findByRole('button', { name: 'Use a recovery code' });
  fireEvent.click(recoveryChoice);
  fireEvent.change(screen.getByLabelText('One-time recovery code'), {
    target: { value: 'abcd234567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use recovery code' }));

  await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith(
    '/api/v1/auth/admin/2fa/verify',
    { preAuthToken: 'pre-auth-token', backupCode: 'ABCD234567' },
  ));
  expect(loginMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'admin-1023', role: 'admin' }),
    { mustRotatePassword: false },
  );
});
