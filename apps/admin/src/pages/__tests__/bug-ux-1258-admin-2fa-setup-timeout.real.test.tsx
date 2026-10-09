import { it, expect, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiPostMock = vi.fn();
type AbortableRequestInit = {
  signal?: {
    addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  };
};

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

it('Bug UX-1258 — a hanging 2FA setup request times out into a retryable error state', async () => {
  vi.useFakeTimers();
  try {
    apiPostMock.mockImplementation((url: string, _body: unknown, init?: AbortableRequestInit) => {
      if (url === '/api/v1/auth/admin/login') {
        return Promise.resolve({
          data: { data: { requires2FASetup: true, preAuthToken: 'setup-token' } },
        });
      }
      if (url === '/api/v1/auth/admin/2fa/setup') {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        });
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

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('Generating setup key');

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('We could not generate the setup key');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try generating setup again' })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
