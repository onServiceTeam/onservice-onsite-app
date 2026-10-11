import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// D37 (Ken, 2026-10-11): email codes replace phone codes on the sign-in
// screens while SMS is paused. Real screens, real email-flow store and real
// CAPTCHA-aware request hook; only the auth store's network actions, the
// router and the server's method switch are substituted.

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    Link: ({ children, href }: { children: React.ReactNode; href: unknown }) =>
      ReactLib.createElement('a', { href: typeof href === 'string' ? href : '#' }, children),
  };
});
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
const mockToast = jest.fn();
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const mockMethods = { status: 'ready', phone: false, email: true, codeLength: 6, validForMs: 300000, resendCooldownMs: 30000 };
jest.mock('@/hooks/useAuthMethods', () => ({
  useAuthMethods: () => ({ ...mockMethods, retry: jest.fn() }),
}));

const mockAuth = {
  user: null as null | { role: string },
  sessionExpired: false,
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  register: jest.fn(),
  requestEmailCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  completeEmailSignup: jest.fn(),
};
jest.mock('@/stores/auth.store', () => {
  const useAuthStore = (selector?: (value: typeof mockAuth) => unknown) => (selector ? selector(mockAuth) : mockAuth);
  useAuthStore.getState = () => mockAuth;
  return { useAuthStore };
});

import LoginScreen from '../app/auth/login';
import EmailVerifyScreen, { formatClock } from '../app/auth/email-verify';
import CreateAccountScreen from '../app/auth/create-account';
import { useEmailSignInFlow } from '@/stores/email-signin.store';
import { ApiError } from '@/services/api';

const receipt = (over: Partial<Record<string, unknown>> = {}) => ({
  challengeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', resent: false, expiresInMs: 300000, resendInMs: 30000,
  validForMs: 300000, message: '', ...over,
});
const apiError = (status: number, error: Record<string, unknown>) =>
  new ApiError(status, { success: false, error: { statusCode: status, ...error } } as never, 'failed');

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockMethods, { status: 'ready', phone: false, email: true });
  mockAuth.user = null;
  mockAuth.requestEmailCode.mockResolvedValue(receipt());
  useEmailSignInFlow.getState().clear();
});
afterEach(() => { jest.useRealTimers(); });

it('D37 - with email codes on, the login screen asks for an email and no phone number', async () => {
  render(<LoginScreen />);
  expect(screen.getByText('Enter your email address to log in')).toBeTruthy();
  expect(screen.queryByText('Mobile Number')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send Verification Code' })).toBeNull();

  fireEvent.change(screen.getByTestId('email-signin-input'), { target: { value: 'not-an-email' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  expect(await screen.findByText('Enter a valid email address, for example juan@gmail.com')).toBeTruthy();
  expect(mockAuth.requestEmailCode).not.toHaveBeenCalled();

  fireEvent.change(screen.getByTestId('email-signin-input'), { target: { value: '  Juan.Cruz@Gmail.com ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/email-verify'));
  expect(mockAuth.requestEmailCode).toHaveBeenCalledWith('Juan.Cruz@Gmail.com');
  // The address travels in memory, never in the route.
  expect(JSON.stringify(mockPush.mock.calls)).not.toContain('Gmail');
  expect(useEmailSignInFlow.getState()).toMatchObject({ email: 'Juan.Cruz@Gmail.com', mode: 'login' });
});

it('D37 - with phone codes back on and email off, the kept phone form returns', () => {
  Object.assign(mockMethods, { phone: true, email: false });
  render(<LoginScreen />);
  expect(screen.getByText('Enter your mobile number to log in')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send Verification Code' })).toBeTruthy();
  expect(screen.queryByTestId('email-signin-input')).toBeNull();
});

it('D37 - a server error while sending is shown on the form', async () => {
  mockAuth.requestEmailCode.mockRejectedValue(apiError(400, {
    message: "We can't send email to this address. Please check it for typos.", code: 'email_domain_cannot_receive' }));
  render(<LoginScreen />);
  fireEvent.change(screen.getByTestId('email-signin-input'), { target: { value: 'someone@gmial.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  expect(await screen.findByText("We can't send email to this address. Please check it for typos.")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it('D37 - the code screen counts down 5 minutes, unlocks Resend after 30 seconds and re-sends the same code', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-12T00:00:00.000Z') });
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000 });
  render(<EmailVerifyScreen />);
  expect(screen.getByText('juan@gmail.com')).toBeTruthy();
  expect(screen.getByTestId('email-code-clock').textContent).toBe('Code expires in 5:00');
  expect(screen.getByText('Resend code in 0:30')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();

  act(() => { jest.advanceTimersByTime(30000); });
  expect(screen.getByTestId('email-code-clock').textContent).toBe('Code expires in 4:30');
  mockAuth.requestEmailCode.mockResolvedValue(receipt({ resent: true, expiresInMs: 270000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
    'We sent the same code again. Check your inbox and spam folder.', 'success'));
  expect(mockAuth.requestEmailCode).toHaveBeenCalledWith('juan@gmail.com');
  // Same expiry as before: the resend does not add time.
  expect(screen.getByTestId('email-code-clock').textContent).toBe('Code expires in 4:30');
  expect(screen.getByText('Resend code in 0:30')).toBeTruthy();
});

it('D37 - at 5 minutes the code screen says the code expired and offers a new one', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-12T00:00:00.000Z') });
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000 });
  render(<EmailVerifyScreen />);
  act(() => { jest.advanceTimersByTime(299000); });
  expect(screen.getByTestId('email-code-clock').textContent).toBe('Code expires in 0:01');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByTestId('email-code-clock').textContent).toBe('This code has expired.');
  expect((screen.getByRole('button', { name: 'Verify' }) as HTMLButtonElement).disabled).toBe(true);

  mockAuth.requestEmailCode.mockResolvedValue(receipt({ resent: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('We sent you a new code. It works for 5 minutes.', 'success'));
  expect(screen.getByTestId('email-code-clock').textContent).toBe('Code expires in 5:00');
});

it('D37 - the right code signs an existing customer in and goes home', async () => {
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000 });
  mockAuth.verifyEmailCode.mockImplementation(async () => { mockAuth.user = { role: 'customer' }; return { status: 'signed_in', isNewUser: false }; });
  render(<EmailVerifyScreen />);
  fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '042917' } });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home'));
  expect(mockAuth.verifyEmailCode).toHaveBeenCalledWith('juan@gmail.com', '042917');
  expect(useEmailSignInFlow.getState().email).toBeNull();
  // expo-router runs queued navigations in order: home must be the last one,
  // never followed by the screen's own "start over" redirect.
  await act(async () => { await Promise.resolve(); });
  expect(mockReplace.mock.calls.map(call => call[0])).toEqual(['/(tabs)/home']);
});

it('D37 - providers and team members land on their own home after the code', async () => {
  for (const [role, home] of [['provider', '/(provider-tabs)/dashboard'], ['provider_staff', '/staff/jobs']] as const) {
    mockReplace.mockClear();
    useEmailSignInFlow.getState().start('pro@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000 });
    mockAuth.verifyEmailCode.mockImplementation(async () => { mockAuth.user = { role }; return { status: 'signed_in', isNewUser: false }; });
    const view = render(<EmailVerifyScreen />);
    fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '123456' } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(home));
    await act(async () => { await Promise.resolve(); });
    expect(mockReplace.mock.calls.map(call => call[0])).toEqual([home]);
    view.unmount();
  }
});

it('D37 - a wrong code shows the tries left; a dead code switches to "Send a new code"', async () => {
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000 });
  mockAuth.verifyEmailCode.mockRejectedValueOnce(apiError(400, { message: 'Incorrect code. 4 tries left.', code: 'email_code_incorrect' }));
  render(<EmailVerifyScreen />);
  fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '111111' } });
  expect(await screen.findByText('Incorrect code. 4 tries left.')).toBeTruthy();
  expect(screen.getByTestId('email-code-clock').textContent).not.toBe('This code has expired.');

  mockAuth.verifyEmailCode.mockRejectedValueOnce(apiError(400, { message: 'This code has expired. Please ask for a new code.', code: 'email_code_expired' }));
  fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '222222' } });
  expect(await screen.findByText('This code has expired. Please ask for a new code.')).toBeTruthy();
  expect(screen.getByTestId('email-code-clock').textContent).toBe('This code has expired.');
  expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy();
});

it('D37 - a new email goes to "Create your account", which creates it with name and mobile number', async () => {
  useEmailSignInFlow.getState().start('new@gmail.com', 'register', { expiresInMs: 300000, resendInMs: 30000 });
  mockAuth.verifyEmailCode.mockResolvedValue({ status: 'needs_account', email: 'new@gmail.com',
    signupToken: 'synthetic.signup.token-value', signupExpiresInSeconds: 1800 });
  const verifyView = render(<EmailVerifyScreen />);
  fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '654321' } });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/create-account'));
  expect(JSON.stringify(mockReplace.mock.calls)).not.toContain('synthetic.signup');
  verifyView.unmount();

  render(<CreateAccountScreen />);
  expect(screen.getByText('new@gmail.com')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText('Enter your first name')).toBeTruthy();
  expect(mockAuth.completeEmailSignup).not.toHaveBeenCalled();

  fireEvent.change(screen.getByTestId('create-account-first-name'), { target: { value: ' Nova ' } });
  fireEvent.change(screen.getByTestId('create-account-last-name'), { target: { value: 'Reyes' } });
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9171234567' } });
  mockAuth.completeEmailSignup.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/provider-onboarding/role-select'));
  expect(mockAuth.completeEmailSignup).toHaveBeenCalledWith({
    signupToken: 'synthetic.signup.token-value', firstName: 'Nova', lastName: 'Reyes', phone: '+639171234567' });
  expect(useEmailSignInFlow.getState().signupToken).toBeNull();
  // The new account must not be sent back to "Create account" afterwards.
  await act(async () => { await Promise.resolve(); });
  expect(mockReplace.mock.calls.map(call => call[0])).toEqual(['/auth/create-account', '/provider-onboarding/role-select']);
});

it('D37 - "Use a different email" returns to the screen the person came from, once', async () => {
  for (const [mode, start] of [['register', '/auth/register'], ['login', '/auth/login']] as const) {
    mockReplace.mockClear();
    useEmailSignInFlow.getState().start('juan@gmail.com', mode, { expiresInMs: 300000, resendInMs: 30000 });
    const view = render(<EmailVerifyScreen />);
    fireEvent.click(screen.getByText('Use a different email'));
    await act(async () => { await Promise.resolve(); });
    expect(mockReplace.mock.calls.map(call => call[0])).toEqual([start]);
    view.unmount();
  }
});

it('D37 - asking again while a code is still live opens the code screen instead of an error', async () => {
  mockAuth.requestEmailCode.mockRejectedValue(apiError(429, { message: 'We just sent you a code.', code: 'email_code_resend_too_soon',
    codePending: true, expiresInMs: 250000, retryAfterMs: 12000 }));
  render(<LoginScreen />);
  fireEvent.change(screen.getByTestId('email-signin-input'), { target: { value: 'juan@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/email-verify'));
  expect(screen.queryByText('We just sent you a code.')).toBeNull();
  const state = useEmailSignInFlow.getState();
  expect(state).toMatchObject({ email: 'juan@gmail.com', alreadySent: true });
  expect(state.expiresAt - Date.now()).toBeGreaterThan(240000);
  expect(state.resendAt - Date.now()).toBeGreaterThan(10000);
});

it('D37 - a second Enter while sending is ignored instead of showing an error', async () => {
  let release: (value: unknown) => void = () => undefined;
  mockAuth.requestEmailCode.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  render(<LoginScreen />);
  const input = screen.getByTestId('email-signin-input');
  fireEvent.change(input, { target: { value: 'juan@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  expect(mockAuth.requestEmailCode).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/already in progress/)).toBeNull();
  await act(async () => { release(receipt()); });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/email-verify'));
});

it('D37 - the code screen says when the email was not confirmed, or was sent earlier', () => {
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 300000, resendInMs: 30000, delivery: 'unknown' });
  const uncertain = render(<EmailVerifyScreen />);
  expect(screen.getByTestId('email-code-uncertain').textContent).toContain("couldn't confirm the email went out");
  uncertain.unmount();
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 200000, resendInMs: 5000 }, { alreadySent: true });
  render(<EmailVerifyScreen />);
  expect(screen.getByTestId('email-code-already-sent').textContent).toContain('already sent a code');
});

it('D37 - after expiry, "Send a new code" waits out the server\'s limit instead of re-asking', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-12T00:00:00.000Z') });
  useEmailSignInFlow.getState().start('juan@gmail.com', 'login', { expiresInMs: 1000, resendInMs: 0 });
  render(<EmailVerifyScreen />);
  act(() => { jest.advanceTimersByTime(1000); });
  mockAuth.requestEmailCode.mockRejectedValue(apiError(429, { message: 'Too many codes were requested for this email.',
    code: 'email_code_hourly_limit', retryAfterMs: 120000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
  await waitFor(() => expect(screen.getByText('Send a new code in 2:00')).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Send a new code' })).toBeNull();
  expect(mockAuth.requestEmailCode).toHaveBeenCalledTimes(1);
});

it('D37 - while the server\'s answer loads, neither form shows', () => {
  Object.assign(mockMethods, { status: 'loading', phone: true, email: true });
  render(<LoginScreen />);
  expect(screen.getByLabelText('Checking sign-in options')).toBeTruthy();
  expect(screen.queryByTestId('email-signin-input')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send Verification Code' })).toBeNull();
});

it('D37 - with both methods on, email comes first and the phone form is one tap away', () => {
  Object.assign(mockMethods, { status: 'ready', phone: true, email: true });
  render(<LoginScreen />);
  expect(screen.getByTestId('email-signin-input')).toBeTruthy();
  fireEvent.click(screen.getByText('Use my mobile number instead'));
  expect(screen.getByRole('button', { name: 'Send Verification Code' })).toBeTruthy();
  expect(screen.queryByTestId('email-signin-input')).toBeNull();
  fireEvent.click(screen.getByText('Use my email instead'));
  expect(screen.getByTestId('email-signin-input')).toBeTruthy();
});

it('D37 - a reloaded web page with nothing in memory goes back to the start', () => {
  render(<EmailVerifyScreen />);
  expect(mockReplace).toHaveBeenCalledWith('/auth/login');
  mockReplace.mockClear();
  render(<CreateAccountScreen />);
  expect(mockReplace).toHaveBeenCalledWith('/auth/register');
});

it('D37 - the countdown rounds up so 0:00 appears only when the time is gone', () => {
  expect(formatClock(300000)).toBe('5:00');
  expect(formatClock(299001)).toBe('5:00');
  expect(formatClock(299000)).toBe('4:59');
  expect(formatClock(1)).toBe('0:01');
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(-5)).toBe('0:00');
});
