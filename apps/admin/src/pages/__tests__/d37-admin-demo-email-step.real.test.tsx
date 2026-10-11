import { it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// D37 review: the demo entry must not treat the emailed-code step as a
// completed sign-in (it would mark the console signed in without a session).

const apiPostMock = vi.fn();
const loginMock = vi.fn();
vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: false, login: loginMock }) }));
vi.mock('@/config/demo', () => ({ DEMO_MODE: true, DEMO_ADMIN: { email: 'demo@example.com', password: 'demo-password' } }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }));

import LoginPage from '../LoginPage';

it('D37 - demo entry stops at the emailed-code step instead of faking a sign-in', async () => {
  apiPostMock.mockResolvedValue({ data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email',
    user: { id: 'demo', role: 'admin' } } } });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Enter as Admin (demo)' }));
  expect(await screen.findByText('Demo entry unavailable while admin 2FA is enabled.')).toBeTruthy();
  expect(loginMock).not.toHaveBeenCalled();
});
