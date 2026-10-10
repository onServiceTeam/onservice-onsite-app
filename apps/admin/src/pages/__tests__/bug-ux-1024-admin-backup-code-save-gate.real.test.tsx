import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();
const loginMock = vi.fn();
const recoveryCodes = [
  'AAAAA22222',
  'BBBBB33333',
  'CCCCC44444',
  'DDDDD55555',
  'EEEEE66666',
  'FFFFF77777',
  'GGGGG88888',
  'HHHHH99999',
];

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

it('Bug UX-1024 — enrollment shows all eight codes once and blocks entry until secure storage is acknowledged', async () => {
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return {
        data: {
          data: {
            requires2FASetup: true,
            preAuthToken: 'setup-token',
          },
        },
      };
    }
    if (url === '/api/v1/auth/admin/2fa/setup') {
      return { data: { data: { secret: 'SETUPSECRET', uri: 'otpauth://test' } } };
    }
    if (url === '/api/v1/auth/admin/2fa/enable') {
      return {
        data: {
          data: {
            user: {
              id: 'admin-1024',
              email: 'admin@onservice.ph',
              phone: '+639171234567',
              firstName: 'Admin',
              lastName: 'Operator',
              role: 'admin',
              avatarUrl: null,
            },
            backupCodes: recoveryCodes,
            mustRotatePassword: false,
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

  const setupInput = await screen.findByLabelText('6-digit code from your authenticator app');
  fireEvent.change(setupInput, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enable & Sign In' }));

  const codeList = await screen.findByRole('list', {
    name: 'One-time administrator recovery codes',
  });
  expect(within(codeList).getAllByRole('listitem')).toHaveLength(8);
  for (const code of recoveryCodes) expect(codeList).toHaveTextContent(code);

  const continueButton = screen.getByRole('button', {
    name: 'Continue to the operations console',
  });
  expect(continueButton).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I saved these codes in a private password manager/i));
  expect(continueButton).toBeEnabled();
  fireEvent.click(continueButton);

  await waitFor(() => expect(loginMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'admin-1024', role: 'admin' }),
    { mustRotatePassword: false },
  ));
});
