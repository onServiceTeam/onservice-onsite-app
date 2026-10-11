import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// D37: the sign-in screens follow the server's switches (GET /api/v1/auth/methods),
// so phone codes can be resumed later without releasing a new app. A slow,
// failed or older server must never hide the method that actually works.

const mockGet = jest.fn();
const mockStore = new Map<string, string>();
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
  storage: { getString: (key: string) => mockStore.get(key), set: (key: string, value: string) => { mockStore.set(key, value); } },
}));
jest.unmock('@/hooks/useAuthMethods');

import { useAuthMethods } from '@/hooks/useAuthMethods';

function Probe(): React.ReactElement {
  const methods = useAuthMethods();
  return (
    <div>
      <span data-testid="state">{`${methods.status} phone=${methods.phone} email=${methods.email} valid=${methods.validForMs}`}</span>
      <button type="button" onClick={methods.retry}>retry</button>
    </div>
  );
}
const answer = (phone: unknown, email: boolean) => ({ data: { success: true, data: {
  phoneOtp: phone === undefined ? { supported: true } : { supported: true, enabled: phone },
  emailCode: { enabled: email, codeLength: 6, validForMs: 300000, resendCooldownMs: 30000 } } } });

beforeEach(() => { mockGet.mockReset(); mockStore.clear(); });

it('D37 - the screens read both switches from the server without credentials', async () => {
  mockGet.mockResolvedValue(answer(false, true));
  render(<Probe />);
  // Before any answer: the server default (phone on, email off), still loading.
  expect(screen.getByTestId('state').textContent).toBe('loading phone=true email=false valid=300000');
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready phone=false email=true valid=300000'));
  expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/methods', { auth: 'anonymous' });
});

it('D37 - when the server turns phone codes back on and email off, the screens follow', async () => {
  mockGet.mockResolvedValue(answer(true, false));
  render(<Probe />);
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready phone=true email=false valid=300000'));
});

it('D37 - an older server without the switch means phone codes are on', async () => {
  mockGet.mockResolvedValue(answer(undefined, false));
  render(<Probe />);
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready phone=true email=false valid=300000'));
});

it('D37 - an unreachable server falls back to the last answer, or the server default, and can be retried', async () => {
  mockGet.mockRejectedValueOnce(new Error('offline'));
  const first = render(<Probe />);
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('unavailable phone=true email=false valid=300000'));
  first.unmount();

  // A good answer is remembered on this device...
  mockGet.mockResolvedValueOnce(answer(false, true));
  const second = render(<Probe />);
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready phone=false email=true valid=300000'));
  second.unmount();

  // ...and used when the server cannot be reached next time.
  mockGet.mockRejectedValueOnce(new Error('offline'));
  render(<Probe />);
  expect(screen.getByTestId('state').textContent).toBe('loading phone=false email=true valid=300000');
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('unavailable phone=false email=true valid=300000'));
  mockGet.mockResolvedValueOnce(answer(true, true));
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready phone=true email=true valid=300000'));
});

it('D37 - a malformed answer is treated like an unreachable server', async () => {
  mockGet.mockResolvedValueOnce({ data: { data: { phoneOtp: {}, emailCode: {} } } });
  render(<Probe />);
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('unavailable phone=true email=false valid=300000'));
});
