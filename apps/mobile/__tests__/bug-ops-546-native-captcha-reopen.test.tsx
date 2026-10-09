import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { ApiError } from '@/services/api';

const mockRequestOtp = jest.fn();
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ requestOtp: mockRequestOtp }) }));
const mockWebViews: WebViewProps[] = [];
jest.mock('react-native-webview', () => {
  const ReactModule = require('react') as typeof React;
  return { WebView: (props: WebViewProps) => {
    mockWebViews.push(props);
    return ReactModule.createElement('div', { 'data-testid': props.testID });
  } };
});
const previousKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let NativeModal: typeof import('../src/components/TurnstileModal').default;
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  NativeModal = require('../src/components/TurnstileModal').default;
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = previousKey;
});
const message = (value: unknown): WebViewMessageEvent => ({
  nativeEvent: { url: 'https://app.onservice.ph', data: JSON.stringify(value) },
} as WebViewMessageEvent);

it('Bug OPS-546 — closing a failed native security check allows a fresh loading attempt', async () => {
  const onToken = jest.fn(), onCancel = jest.fn();
  const view = render(<React.StrictMode><NativeModal visible onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  const first = mockWebViews.at(-1)!;
  act(() => first.onMessage!(message({ type: 'error' })));
  expect(screen.getByText(/could not load/)).toBeTruthy();
  expect(screen.queryByTestId('turnstile-webview')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  view.rerender(<React.StrictMode><NativeModal visible={false} onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  view.rerender(<React.StrictMode><NativeModal visible onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
  expect(screen.queryByText(/could not load/)).toBeNull();
  expect(view.container.querySelector('rn-activity-indicator')).not.toBeNull();
  const reopened = mockWebViews.at(-1)!;
  act(() => first.onMessage!(message({ type: 'error' })));
  expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
  act(() => reopened.onMessage!(message({ type: 'token', token: 'fresh-proof' })));
  expect(onToken.mock.calls).toEqual([['fresh-proof']]);
  view.unmount();

  // The real caller can cancel the failed attempt and request for another phone.
  let request!: ReturnType<typeof useCaptchaOtp>['requestOtpWithCaptcha'];
  function Harness(): React.ReactElement {
    const hook = useCaptchaOtp();
    request = hook.requestOtpWithCaptcha;
    return hook.captchaModal;
  }
  const caller = render(<React.StrictMode><Harness /></React.StrictMode>);
  const outcomes: unknown[] = [];
  mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Synthetic security check required.'));
  await act(async () => {
    void request('+639000000401').then(() => outcomes.push('accepted'), error => outcomes.push(error));
  });
  const failedPage = mockWebViews.at(-1)!;
  act(() => failedPage.onMessage!(message({ type: 'error' })));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]).toBeInstanceOf(Error);
  mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Synthetic security check required.'));
  await act(async () => {
    void request('+639000000402').then(() => outcomes.push('accepted'), error => outcomes.push(error));
  });
  expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
  const currentPage = mockWebViews.at(-1)!;
  await act(async () => failedPage.onMessage!(message({ type: 'token', token: 'stale-proof' })));
  expect(mockRequestOtp.mock.calls).toEqual([['+639000000401'], ['+639000000402']]);
  mockRequestOtp.mockResolvedValueOnce(undefined);
  await act(async () => currentPage.onMessage!(message({ type: 'token', token: 'current-proof' })));
  expect(mockRequestOtp.mock.calls).toEqual([
    ['+639000000401'], ['+639000000402'], ['+639000000402', 'current-proof'],
  ]);
  expect(outcomes.at(-1)).toBe('accepted');
  caller.unmount();
});
