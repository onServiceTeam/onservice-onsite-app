import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();

vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login: vi.fn() }),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') },
}));

import LoginPage from '../LoginPage';

it('Bug UX-1255 — choosing recovery-code verification replaces the authenticator-only instruction', async () => {
  apiPostMock.mockResolvedValueOnce({
    data: { data: { requires2FA: true, preAuthToken: 'pre-auth-token' } },
  });

  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'admin@onservice.ph' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(await screen.findByText('Enter the current six-digit code from your authenticator app.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));

  expect(screen.getByText('Enter one unused recovery code. Each recovery code works only once.')).toBeInTheDocument();
  expect(screen.queryByText('Enter the current six-digit code from your authenticator app.')).not.toBeInTheDocument();
});
