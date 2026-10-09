import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockRequestOtp = jest.fn();
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ requestOtp: mockRequestOtp }) }));
jest.mock('@/components/TurnstileModal', () => jest.requireActual('../src/components/TurnstileModal.web'));
const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
type WidgetOptions = Parameters<NonNullable<typeof window.turnstile>['render']>[1];
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
});
afterAll(() => {
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
});

it('Bug OPS-544 — overlapping OTP calls cannot send twice or replace the active challenge owner', async () => {
  const widgets: WidgetOptions[] = [];
  window.turnstile = {
    render: (_host, options) => { widgets.push(options); return `widget-${widgets.length}`; },
    remove: jest.fn(),
  };
  let request!: ReturnType<typeof useCaptchaOtp>['requestOtpWithCaptcha'];
  function Harness(): React.ReactElement {
    const hook = useCaptchaOtp();
    request = hook.requestOtpWithCaptcha;
    return hook.captchaModal;
  }
  render(<React.StrictMode><Harness /></React.StrictMode>);
  let rejectInitial!: (reason: Error) => void;
  let rejectProof!: (reason: Error) => void;
  mockRequestOtp.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectInitial = reject; }));
  const outcomes: unknown[] = [];
  const observe = (phone: string): void => {
    void request(phone).then(() => { outcomes.push('accepted'); }, error => { outcomes.push(error); });
  };
  await act(async () => {
    observe('+639000000301');
    observe('+639000000301');
    observe('+639000000302');
  });
  expect(mockRequestOtp.mock.calls).toEqual([['+639000000301']]);
  expect(outcomes).toHaveLength(2);
  expect(outcomes.every(value => value instanceof Error)).toBe(true);

  await act(async () => rejectInitial(new ApiError(428, null, 'Security check required.')));
  await waitFor(() => expect(widgets).toHaveLength(1));
  await act(async () => observe('+639000000302'));
  expect(mockRequestOtp).toHaveBeenCalledTimes(1);
  expect(outcomes).toHaveLength(3);
  mockRequestOtp.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectProof = reject; }));
  await act(async () => widgets[0]!.callback('owned-proof'));
  expect(mockRequestOtp.mock.calls).toEqual([['+639000000301'], ['+639000000301', 'owned-proof']]);
  await act(async () => observe('+639000000302'));
  expect(mockRequestOtp).toHaveBeenCalledTimes(2);
  const failure = new ApiError(503, null, 'Synthetic service unavailable.');
  await act(async () => rejectProof(failure));
  expect(outcomes.at(-1)).toBe(failure);
  expect(mockRequestOtp).toHaveBeenCalledTimes(2); // No automatic replay after failure.

  // Explicit cancellation releases ownership, and a later request is usable.
  mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Security check required.'));
  await act(async () => observe('+639000000302'));
  await waitFor(() => expect(widgets).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  expect(outcomes.at(-1)).toBeInstanceOf(Error);
  mockRequestOtp.mockResolvedValueOnce(undefined);
  await act(async () => observe('+639000000302'));
  expect(outcomes.at(-1)).toBe('accepted');
  expect(mockRequestOtp.mock.calls).toEqual([
    ['+639000000301'], ['+639000000301', 'owned-proof'], ['+639000000302'], ['+639000000302'],
  ]);
  const denial = new ApiError(429, null, 'Synthetic cooldown.');
  mockRequestOtp.mockRejectedValueOnce(denial);
  await act(async () => observe('+639000000302'));
  expect(outcomes.at(-1)).toBe(denial);
  expect(widgets).toHaveLength(2);
});
