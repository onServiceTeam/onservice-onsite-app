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

it('Bug UX-1257 — abandoning a temporary 2FA session returns to login without retaining the password', async () => {
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

  fireEvent.click(await screen.findByRole('button', { name: 'Back to login' }));

  expect(screen.getByLabelText('Email')).toHaveValue('admin@onservice.ph');
  expect(screen.getByLabelText('Password')).toHaveValue('');
});
