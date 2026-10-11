import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// D37 (Ken, 2026-10-11): with the server's ADMIN_SECOND_FACTOR=email, the
// admin console's second step is a 6-digit code sent to the admin's email,
// valid 5 minutes, with "Resend code" sending the same code inside that time.

const apiPostMock = vi.fn();
const loginMock = vi.fn();
vi.mock('@/lib/api', () => ({
  default: { post: (...args: unknown[]) => apiPostMock(...args) },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ isAuthenticated: false, login: loginMock }),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }));

import LoginPage from '../LoginPage';

const adminUser = { id: 'admin-d37', email: 'ken@example.com', phone: '+639171234567', firstName: 'Ken',
  lastName: 'Admin', role: 'super_admin', avatarUrl: null };

beforeEach(() => { apiPostMock.mockReset(); loginMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

async function signInWithPassword(): Promise<void> {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ken@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await screen.findByText('Check your email');
}

it('D37 - admin: after the password, the emailed code finishes sign-in', async () => {
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email', emailHint: 'k***@example.com',
        expiresInMs: 300000, resendInMs: 30000 } } };
    }
    if (url === '/api/v1/auth/admin/email-code/verify') return { data: { data: { user: adminUser, mustRotatePassword: false } } };
    throw new Error(`Unexpected API call: ${url}`);
  });
  await signInWithPassword();
  expect(screen.getByText('We sent a 6-digit code to k***@example.com. It works for 5 minutes.')).toBeTruthy();
  expect(screen.queryByText(/authenticator app/)).toBeNull();
  expect(screen.getByTestId('admin-email-code-clock').textContent).toBe('Code expires in 5:00');
  expect(screen.getByText('Resend code in 0:30')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Code from your email'), { target: { value: '04 29-17' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/v1/auth/admin/email-code/verify',
    { preAuthToken: 'pre-auth-email', code: '042917' }));
  expect(loginMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'admin-d37', role: 'super_admin' }),
    { mustRotatePassword: false });
});

it('D37 - admin: Resend unlocks after 30 seconds and the code expires at 5 minutes', async () => {
  vi.useFakeTimers({ now: new Date('2026-10-12T00:00:00.000Z'), shouldAdvanceTime: false });
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email', emailHint: 'k***@example.com',
        expiresInMs: 300000, resendInMs: 30000 } } };
    }
    if (url === '/api/v1/auth/admin/email-code/resend') return { data: { data: { resent: true, expiresInMs: 270000, resendInMs: 30000 } } };
    throw new Error(`Unexpected API call: ${url}`);
  });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ken@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign In' })); });
  expect(screen.getByText('Check your email')).toBeTruthy();

  act(() => { vi.advanceTimersByTime(30000); });
  expect(screen.getByTestId('admin-email-code-clock').textContent).toBe('Code expires in 4:30');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend code' })); });
  expect(apiPostMock).toHaveBeenCalledWith('/api/v1/auth/admin/email-code/resend', { preAuthToken: 'pre-auth-email' });
  expect(screen.getByText('We sent the same code again. Check your inbox and spam folder.')).toBeTruthy();
  expect(screen.getByTestId('admin-email-code-clock').textContent).toBe('Code expires in 4:30');
  expect(screen.getByText('Resend code in 0:30')).toBeTruthy();

  act(() => { vi.advanceTimersByTime(270000); });
  expect(screen.getByTestId('admin-email-code-clock').textContent).toBe('This code has expired.');
  expect((screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy();
});

it('D37 - admin: a wrong code shows the server message and clears the box', async () => {
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email', emailHint: 'k***@example.com',
        expiresInMs: 300000, resendInMs: 30000 } } };
    }
    if (url === '/api/v1/auth/admin/email-code/verify') {
      throw Object.assign(new Error('Incorrect code. 4 tries left.'), { body: { error: { code: 'email_code_incorrect' } } });
    }
    throw new Error(`Unexpected API call: ${url}`);
  });
  await signInWithPassword();
  fireEvent.change(screen.getByLabelText('Code from your email'), { target: { value: '111111' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByText('Incorrect code. 4 tries left.')).toBeTruthy();
  expect((screen.getByLabelText('Code from your email') as HTMLInputElement).value).toBe('');
  expect(loginMock).not.toHaveBeenCalled();
});

// ---- review fixes (2026-10-12) ---------------------------------------------

it('D37 - admin: the authenticator app is offered as the other way in', async () => {
  apiPostMock.mockImplementation(async (url: string, body: Record<string, unknown>) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email', totpPreAuthToken: 'pre-auth-totp',
        emailHint: 'k***@example.com', expiresInMs: 300000, resendInMs: 30000 } } };
    }
    if (url === '/api/v1/auth/admin/2fa/verify') {
      expect(body).toEqual({ preAuthToken: 'pre-auth-totp', totpCode: '123456' });
      return { data: { data: { user: adminUser, mustRotatePassword: false } } };
    }
    throw new Error(`Unexpected API call: ${url}`);
  });
  await signInWithPassword();
  fireEvent.click(screen.getByRole('button', { name: 'Use authenticator app instead' }));
  expect(await screen.findByText('Enter the current six-digit code from your authenticator app.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(loginMock).toHaveBeenCalled());
});

it('D37 - admin: no authenticator, no switch button', async () => {
  apiPostMock.mockResolvedValue({ data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email',
    emailHint: 'k***@example.com', expiresInMs: 300000, resendInMs: 30000 } } });
  await signInWithPassword();
  expect(screen.queryByRole('button', { name: 'Use authenticator app instead' })).toBeNull();
});

it('D37 - admin: notes when a code was already sent or the email was not confirmed', async () => {
  apiPostMock.mockResolvedValueOnce({ data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email',
    emailHint: 'k***@example.com', expiresInMs: 200000, resendInMs: 9000, codeAlreadySent: true } } });
  await signInWithPassword();
  expect(screen.getByText('We already sent you a code a moment ago. Enter it below.')).toBeTruthy();
  expect(screen.getByText('Resend code in 0:09')).toBeTruthy();
});

it('D37 - admin: an unconfirmed email is flagged so the admin knows to resend', async () => {
  apiPostMock.mockResolvedValueOnce({ data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email',
    emailHint: 'k***@example.com', expiresInMs: 300000, resendInMs: 30000, delivery: 'unknown' } } });
  await signInWithPassword();
  expect(screen.getByText("We couldn't confirm the email went out. If it doesn't arrive within a minute, use Resend.")).toBeTruthy();
});

it('D37 - admin: after expiry, "Send a new code" honours the server wait', async () => {
  vi.useFakeTimers({ now: new Date('2026-10-12T00:00:00.000Z'), shouldAdvanceTime: false });
  apiPostMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/admin/login') {
      return { data: { data: { requiresEmailCode: true, preAuthToken: 'pre-auth-email', emailHint: 'k***@example.com',
        expiresInMs: 1000, resendInMs: 0 } } };
    }
    if (url === '/api/v1/auth/admin/email-code/resend') {
      throw Object.assign(new Error('Too many codes were requested for this email.'),
        { body: { error: { code: 'email_code_hourly_limit', retryAfterMs: 120000 } } });
    }
    throw new Error(`Unexpected API call: ${url}`);
  });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ken@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign In' })); });
  act(() => { vi.advanceTimersByTime(1000); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send a new code' })); });
  expect(screen.getByText('Send a new code in 2:00')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send a new code' })).toBeNull();
});
