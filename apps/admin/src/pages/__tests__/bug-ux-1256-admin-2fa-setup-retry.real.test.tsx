import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('Bug UX-1256 — a failed 2FA setup request becomes a retryable state instead of an endless loader', async () => {
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return {
        data: { data: { requires2FASetup: true, preAuthToken: 'setup-token' } },
      };
    }
    if (url === '/api/v1/auth/admin/2fa/setup') {
      const setupCalls = apiPostMock.mock.calls.filter(([path]) => path === '/api/v1/auth/admin/2fa/setup').length;
      if (setupCalls === 1) throw new Error('network unavailable');
      return { data: { data: { secret: 'SETUPSECRET', uri: 'otpauth://test' } } };
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

  expect(await screen.findByRole('alert')).toHaveTextContent('We could not generate the setup key');
  expect(screen.queryByText(/Generating setup key/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try generating setup again' }));

  await waitFor(() => expect(screen.getByText('SETUPSECRET')).toBeInTheDocument());
  expect(apiPostMock.mock.calls.filter(([path]) => path === '/api/v1/auth/admin/2fa/setup')).toHaveLength(2);
});
