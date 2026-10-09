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
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
let NativeModal: typeof import('../src/components/TurnstileModal').default;
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
  NativeModal = require('../src/components/TurnstileModal').default;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = previousKey;
});
const message = (token: string): WebViewMessageEvent => ({
  nativeEvent: { url: 'https://app.onservice.ph', data: JSON.stringify({ type: 'token', token }) },
} as WebViewMessageEvent);
type Termination = 'android-crash' | 'android-reclaimed' | 'ios';
function terminate(page: WebViewProps, kind: Termination): void {
  // These are the two distinct installed WebView callbacks, not onError.
  if (kind === 'ios') page.onContentProcessDidTerminate?.({ nativeEvent: {} } as Parameters<NonNullable<WebViewProps['onContentProcessDidTerminate']>>[0]);
  else page.onRenderProcessGone?.({ nativeEvent: { didCrash: kind === 'android-crash' } } as Parameters<NonNullable<WebViewProps['onRenderProcessGone']>>[0]);
}

it('Bug OPS-551 — renderer termination fails the native check closed and permits only a fresh explicit caller attempt', async () => {
  const kinds: Termination[] = ['android-crash', 'android-reclaimed', 'ios'];
  const observations: unknown[] = [];
  // Record each platform before asserting so the original red exercises both
  // callback families, before and after the page-loading indicator is hidden.
  for (const kind of kinds) {
    for (const loaded of [false, true]) {
      const onToken = jest.fn(), onCancel = jest.fn();
      const view = render(<React.StrictMode><NativeModal visible onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
      const page = mockWebViews.at(-1)!;
      act(() => {
        if (loaded) page.onLoadEnd?.({ nativeEvent: {} } as Parameters<NonNullable<WebViewProps['onLoadEnd']>>[0]);
        terminate(page, kind);
      });
      observations.push({
        kind, loaded,
        error: Boolean(screen.queryByText(/could not load/)),
        webview: Boolean(screen.queryByTestId('turnstile-webview')),
        spinner: Boolean(view.container.querySelector('rn-activity-indicator')),
        callbacks: [onToken.mock.calls.length, onCancel.mock.calls.length],
      });
      view.unmount();
    }
  }
  expect(observations).toEqual(kinds.flatMap(kind => [false, true].map(loaded => ({
    kind, loaded, error: true, webview: false, spinner: false, callbacks: [0, 0],
  }))));

  let request!: ReturnType<typeof useCaptchaOtp>['requestOtpWithCaptcha'];
  function Harness(): React.ReactElement {
    const hook = useCaptchaOtp();
    request = hook.requestOtpWithCaptcha;
    return hook.captchaModal;
  }
  for (const kind of kinds) {
    mockRequestOtp.mockReset();
    const caller = render(<React.StrictMode><Harness /></React.StrictMode>);
    const outcomes: unknown[] = [];
    const observe = (phone: string): void => {
      void request(phone).then(() => outcomes.push('accepted'), error => outcomes.push(error));
    };
    mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Synthetic security check required.'));
    await act(async () => observe('+639000000501'));
    const failedPage = mockWebViews.at(-1)!;
    await act(async () => {
      terminate(failedPage, kind);
      failedPage.onMessage!(message('late-failed-proof'));
      terminate(failedPage, kind);
    });
    expect(screen.getByText(/could not load/)).toBeTruthy();
    expect(screen.queryByTestId('turnstile-webview')).toBeNull();
    expect(mockRequestOtp.mock.calls).toEqual([['+639000000501']]);
    expect(outcomes).toEqual([]); // Failure neither submits nor auto-retries.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toBeInstanceOf(Error);
    expect(screen.queryByText('Quick security check')).toBeNull();

    mockRequestOtp.mockRejectedValueOnce(new ApiError(428, null, 'Synthetic security check required.'));
    await act(async () => observe('+639000000502'));
    const freshPage = mockWebViews.at(-1)!;
    await act(async () => {
      terminate(failedPage, kind);
      failedPage.onMessage!(message('stale-other-phone-proof'));
    });
    expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
    expect(screen.queryByText(/could not load/)).toBeNull();
    expect(mockRequestOtp.mock.calls).toEqual([['+639000000501'], ['+639000000502']]);
    mockRequestOtp.mockResolvedValueOnce(undefined);
    await act(async () => {
      freshPage.onMessage!(message('fresh-owned-proof'));
      terminate(freshPage, kind); // A terminal proof cannot be reopened as failure.
      freshPage.onMessage!(message('duplicate-proof'));
    });
    expect(mockRequestOtp.mock.calls).toEqual([
      ['+639000000501'], ['+639000000502'], ['+639000000502', 'fresh-owned-proof'],
    ]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[1]).toBe('accepted');
    expect(screen.queryByText('Quick security check')).toBeNull();
    caller.unmount();
    await act(async () => {
      terminate(freshPage, kind);
      freshPage.onMessage!(message('unmounted-proof'));
    });
    expect(mockRequestOtp).toHaveBeenCalledTimes(3);
  }
});
