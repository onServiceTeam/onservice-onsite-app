import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { ApiError } from '@/services/api';

const mockRequestOtp = jest.fn();
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ requestOtp: mockRequestOtp }) }));
const mockPages: WebViewProps[] = [];
jest.mock('react-native-webview', () => {
  const ReactModule = require('react') as typeof React;
  return { WebView: (props: WebViewProps) => {
    mockPages.push(props);
    return ReactModule.createElement('div', { 'data-testid': props.testID });
  } };
});
const previousKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = previousKey;
});
function message(url: unknown, token: string): WebViewMessageEvent {
  // A payload-supplied trusted URL cannot replace the native event's attribution.
  return { nativeEvent: { url, data: JSON.stringify({ type: 'token', token, url: 'https://app.onservice.ph' }) } } as WebViewMessageEvent;
}

it('Bug SEC-087 — an unexpected native bridge origin never submits an OTP proof and explicit recovery retains phone ownership', async () => {
  let request!: ReturnType<typeof useCaptchaOtp>['requestOtpWithCaptcha'];
  function Harness(): React.ReactElement {
    const hook = useCaptchaOtp(); request = hook.requestOtpWithCaptcha; return hook.captchaModal;
  }
  const badOrigins = [
    'https://unrelated.invalid/', 'https://app.onservice.ph.evil.invalid/',
    'https://app.onservice.ph@unrelated.invalid/', 'http://app.onservice.ph/',
    'https://challenges.cloudflare.com', 'https://app.onservice.ph/other',
    'https://app.onservice.ph:8443', 'about:blank', 'about:srcdoc', '', undefined, null,
  ];
  const observations: unknown[] = [];
  for (const url of badOrigins) {
    mockRequestOtp.mockReset().mockRejectedValueOnce(new ApiError(428, null, 'Synthetic challenge required.')).mockResolvedValue(undefined);
    const outcomes: unknown[] = [];
    const caller = render(<React.StrictMode><Harness /></React.StrictMode>);
    await act(async () => { void request('+639000000601').then(() => outcomes.push('accepted'), error => outcomes.push(error)); });
    const page = mockPages.at(-1)!;
    await act(async () => page.onMessage!(message(url, 'untrusted-proof')));
    observations.push({ url, requests: [...mockRequestOtp.mock.calls], error: Boolean(screen.queryByText(/could not load/)), settled: outcomes.length });
    caller.unmount();
    await act(async () => {});
  }
  expect(observations).toEqual(badOrigins.map(url => ({ url, requests: [['+639000000601']], error: true, settled: 0 })));

  mockRequestOtp.mockReset().mockRejectedValueOnce(new ApiError(428, null, 'Synthetic challenge required.'));
  const caller = render(<Harness />);
  const outcomes: unknown[] = [];
  const observe = (phone: string): void => { void request(phone).then(() => outcomes.push('accepted'), error => outcomes.push(error)); };
  await act(async () => observe('+639000000602'));
  const failed = mockPages.at(-1)!;
  await act(async () => failed.onMessage!(message('https://unrelated.invalid/', 'wrong-proof')));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  expect(outcomes[0]).toBeInstanceOf(Error);
  for (const url of ['https://app.onservice.ph', 'https://app.onservice.ph/']) {
    mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Synthetic challenge required.'));
    await act(async () => observe('+639000000603'));
    const fresh = mockPages.at(-1)!;
    await act(async () => failed.onMessage!(message(url, 'old-phone-proof')));
    mockRequestOtp.mockResolvedValueOnce(undefined);
    await act(async () => {
      fresh.onMessage!(message(url, 'fresh-proof'));
      fresh.onMessage!(message(url, 'duplicate-proof'));
    });
    expect(outcomes.at(-1)).toBe('accepted');
    expect(screen.queryByText('Quick security check')).toBeNull();
  }
  expect(mockRequestOtp.mock.calls).toEqual([
    ['+639000000602'], ['+639000000603'], ['+639000000603', 'fresh-proof'],
    ['+639000000603'], ['+639000000603', 'fresh-proof'],
  ]);
  caller.unmount();
});
