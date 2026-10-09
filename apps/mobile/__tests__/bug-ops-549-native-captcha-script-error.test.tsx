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

it('Bug OPS-549 — an embedded SDK script error reaches the native recoverable error state', () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const onToken = jest.fn();
  for (const event of ['error', 'load']) {
    const view = render(<NativeModal visible onToken={onToken} onCancel={jest.fn()} />);
    const page = nativeCaptchaPage(mockPages.at(-1)!);
    const script = page.document.querySelector('script[src]')!;
    // A successful resource event with no API must also fail visibly.
    act(() => script.dispatchEvent(new Event(event)));
    expect(screen.getByText(/could not load/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByTestId('turnstile-webview')).toBeNull();
    act(() => runInContext("onTok('late-proof'); onErr();", page.context));
    expect(onToken).not.toHaveBeenCalled();
    expect(page.messages.map(value => JSON.parse(value))).toEqual([{ type: 'error' }]);
    expect(jest.getTimerCount()).toBe(0);
    view.unmount();
  }
});
