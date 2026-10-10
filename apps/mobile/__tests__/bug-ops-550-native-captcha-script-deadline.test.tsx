import React from 'react';
import { act, render, screen } from '@testing-library/react';
import type { WebViewProps } from 'react-native-webview';
import { nativeCaptchaPage } from '../test-support/native-captcha-page';
import { runInContext } from 'node:vm';

const mockPages: WebViewProps[] = [];
jest.mock('react-native-webview', () => {
  const ReactModule = require('react') as typeof React;
  return { WebView: (props: WebViewProps) => {
    mockPages.push(props);
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
afterEach(() => jest.useRealTimers());

it('Bug OPS-550 — an embedded SDK that never loads fails after a bounded wait', () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const onToken = jest.fn();
  const onCancel = jest.fn();
  const view = render(<React.StrictMode><NativeModal visible onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  const props = mockPages.at(-1)!;
  const page = nativeCaptchaPage(props);
  const script = Array.from(page.document.querySelectorAll('script')).find(item => item.src)!;
  const lateLoad = script.onload;
  act(() => props.onLoadEnd?.({ nativeEvent: {} } as Parameters<NonNullable<WebViewProps['onLoadEnd']>>[0]));
  act(() => jest.advanceTimersByTime(14_999));
  expect(screen.queryByText(/could not load/)).toBeNull();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByText(/could not load/)).toBeTruthy();
  expect(onToken).not.toHaveBeenCalled();
  expect(page.messages.map(value => JSON.parse(value))).toEqual([{ type: 'error' }]);
  expect(jest.getTimerCount()).toBe(0);

  view.rerender(<React.StrictMode><NativeModal visible={false} onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  view.rerender(<React.StrictMode><NativeModal visible onToken={onToken} onCancel={onCancel} /></React.StrictMode>);
  const next = nativeCaptchaPage(mockPages.at(-1)!);
  const nextScript = Array.from(next.document.querySelectorAll('script')).find(item => item.src)!;
  next.context.turnstile = { render: jest.fn() };
  act(() => nextScript.dispatchEvent(new Event('load')));
  expect(jest.getTimerCount()).toBe(0);
  act(() => {
    lateLoad?.call(script, new Event('load'));
    runInContext("onTok('old-proof'); onErr();", page.context);
    jest.advanceTimersByTime(60_000);
  });
  // Loading success has no human-solving deadline and never submits by itself.
  expect(screen.queryByText(/could not load/)).toBeNull();
  expect(screen.getByTestId('turnstile-webview')).toBeTruthy();
  expect(onToken).not.toHaveBeenCalled();
  expect(next.messages).toEqual([]);
  act(() => runInContext("onTok(''); onTok(42); onTok('fresh-proof'); onTok('duplicate'); onErr();", next.context));
  expect(onToken.mock.calls).toEqual([['fresh-proof']]);
  expect(next.messages.map(value => JSON.parse(value))).toEqual([{ type: 'token', token: 'fresh-proof' }]);
  expect(jest.getTimerCount()).toBe(0);
  view.unmount();
});
