import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import type { useWebViewLogic } from 'react-native-webview/lib/WebViewShared';

type Page = { props: WebViewProps; logic: ReturnType<typeof useWebViewLogic>; decisions: jest.Mock };
const mockPages: Page[] = [];
jest.mock('react-native-webview', () => {
  const ReactModule = require('react') as typeof React;
  // Execute the installed library's real whitelist, navigation and event logic.
  // Only the physical native view is replaced, not its JS policy implementation.
  const shared = require('react-native-webview/lib/WebViewShared') as typeof import('react-native-webview/lib/WebViewShared');
  return { WebView: (props: WebViewProps) => {
    const decisions = ReactModule.useRef(jest.fn()).current;
    const logic = shared.useWebViewLogic({
      originWhitelist: props.originWhitelist ?? shared.defaultOriginWhitelist,
      onShouldStartLoadWithRequestProp: props.onShouldStartLoadWithRequest,
      onShouldStartLoadWithRequestCallback: decisions,
      onNavigationStateChange: props.onNavigationStateChange,
      onMessageProp: props.onMessage, onOpenWindowProp: props.onOpenWindow,
      onLoadEnd: props.onLoadEnd,
    });
    mockPages.push({ props, logic, decisions });
    return ReactModule.createElement('div', { 'data-testid': props.testID });
  } };
});
const previousKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let NativeModal: typeof import('../src/components/TurnstileModal').default;
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  NativeModal = require('../src/components/TurnstileModal').default;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = previousKey;
});

it('Bug SEC-086 — native check blocks unrelated navigation without opening an external app and preserves challenge frames', async () => {
  const canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const blocked = [
    'https://unrelated.invalid/', 'https://app.onservice.ph.evil.invalid/',
    'https://app.onservice.ph@unrelated.invalid/', 'http://app.onservice.ph/',
    'https://app.onservice.ph/auth/login', 'https://challenges.cloudflare.com/',
    'intent://unrelated', 'file:///private/test', 'javascript:void(0)', 'about:srcdoc',
  ];
  const observations: unknown[] = [];
  for (const url of blocked) {
    const onToken = jest.fn();
    const view = render(<NativeModal visible onToken={onToken} onCancel={jest.fn()} />);
    const page = mockPages.at(-1)!;
    await act(async () => page.logic.onShouldStartLoadWithRequest({ nativeEvent: {
      url, isTopFrame: true, lockIdentifier: 73,
    } } as Parameters<typeof page.logic.onShouldStartLoadWithRequest>[0]));
    observations.push({ url, decisions: page.decisions.mock.calls, error: Boolean(screen.queryByText(/could not load/)) });
    view.unmount();
  }
  expect(observations).toEqual(blocked.map(url => ({ url, decisions: [[false, url, 73]], error: true })));
  expect(canOpen).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();

  for (const url of [
    'https://challenges.cloudflare.com.evil.invalid/frame',
    'https://user@challenges.cloudflare.com/frame',
    'https://challenges.cloudflare.com:8443/frame',
    'http://challenges.cloudflare.com/frame', 'data:text/html,unrelated',
  ]) {
    const frame = render(<NativeModal visible onToken={jest.fn()} onCancel={jest.fn()} />);
    const page = mockPages.at(-1)!;
    act(() => page.logic.onShouldStartLoadWithRequest({ nativeEvent: { url, isTopFrame: false, lockIdentifier: 75 } } as Parameters<typeof page.logic.onShouldStartLoadWithRequest>[0]));
    expect(page.decisions).toHaveBeenLastCalledWith(false, url, 75);
    expect(screen.getByText(/could not load/)).toBeTruthy();
    frame.unmount();
  }

  const onToken = jest.fn(), onCancel = jest.fn();
  const view = render(<NativeModal visible onToken={onToken} onCancel={onCancel} />);
  const page = mockPages.at(-1)!;
  for (const [url, isTopFrame] of [
    ['https://app.onservice.ph', true], ['https://app.onservice.ph/', true], ['about:blank', true],
    ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/synthetic', false],
    ['about:blank', false], ['about:srcdoc', false],
  ] as const) {
    act(() => page.logic.onShouldStartLoadWithRequest({ nativeEvent: { url, isTopFrame, lockIdentifier: 74 } } as Parameters<typeof page.logic.onShouldStartLoadWithRequest>[0]));
    expect(page.decisions).toHaveBeenLastCalledWith(true, url, 74);
    expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
  }
  // Android can allow a navigation if its native 250ms decision wait expires.
  // Exercise the real shared loading callback's independent page-state guard.
  act(() => {
    page.logic.onLoadingStart({ nativeEvent: { url: 'https://unrelated.invalid/' } } as Parameters<typeof page.logic.onLoadingStart>[0]);
    page.logic.onMessage({ nativeEvent: { url: 'https://app.onservice.ph', data: JSON.stringify({ type: 'token', token: 'late-proof' }) } } as Parameters<typeof page.logic.onMessage>[0]);
  });
  expect(screen.getByText(/could not load/)).toBeTruthy();
  expect(screen.queryByTestId('turnstile-webview')).toBeNull();
  expect(onToken).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  view.unmount();

  const popup = render(<NativeModal visible onToken={onToken} onCancel={onCancel} />);
  const next = mockPages.at(-1)!;
  act(() => next.logic.onOpenWindow({ nativeEvent: { targetUrl: 'https://unrelated.invalid/' } } as Parameters<typeof next.logic.onOpenWindow>[0]));
  expect(screen.getByText(/could not load/)).toBeTruthy();
  expect(screen.queryByTestId('turnstile-webview')).toBeNull();
  expect(open).not.toHaveBeenCalled();
  expect(onToken).not.toHaveBeenCalled();
  popup.unmount();

  const success = render(<NativeModal visible onToken={onToken} onCancel={onCancel} />);
  const finalPage = mockPages.at(-1)!;
  act(() => {
    finalPage.logic.onLoadingStart({ nativeEvent: { url: 'https://app.onservice.ph/' } } as Parameters<typeof finalPage.logic.onLoadingStart>[0]);
    finalPage.logic.onLoadingFinish({ nativeEvent: { url: 'https://app.onservice.ph/' } } as Parameters<typeof finalPage.logic.onLoadingFinish>[0]);
    finalPage.logic.onMessage({ nativeEvent: { url: 'https://app.onservice.ph/', data: JSON.stringify({ type: 'token', token: 'owned-proof' }) } } as Parameters<typeof finalPage.logic.onMessage>[0]);
    // Terminal and unmounted attempts cannot be resurrected by late events.
    finalPage.logic.onOpenWindow({ nativeEvent: { targetUrl: 'https://unrelated.invalid/' } } as Parameters<typeof finalPage.logic.onOpenWindow>[0]);
  });
  expect(onToken.mock.calls).toEqual([['owned-proof']]);
  expect(screen.queryByText(/could not load/)).toBeNull();
  success.unmount();
  act(() => finalPage.logic.onMessage({ nativeEvent: { url: 'https://app.onservice.ph', data: JSON.stringify({ type: 'token', token: 'unmounted-proof' }) } } as Parameters<typeof finalPage.logic.onMessage>[0]));
  expect(onToken.mock.calls).toEqual([['owned-proof']]);
  expect(canOpen).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  canOpen.mockRestore(); open.mockRestore();
});
