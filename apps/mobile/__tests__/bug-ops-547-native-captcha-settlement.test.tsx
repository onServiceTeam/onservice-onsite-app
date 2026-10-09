import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';

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
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  NativeModal = require('../src/components/TurnstileModal').default;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = previousKey;
});
const message = (value: unknown): WebViewMessageEvent => ({
  nativeEvent: { url: 'https://app.onservice.ph', data: JSON.stringify(value) },
} as WebViewMessageEvent);

it('Bug OPS-547 — each native widget settles once and ignores removed or cancelled bridge callbacks', () => {
  const firstHandler = jest.fn(), currentHandler = jest.fn(), onCancel = jest.fn();
  const view = render(<NativeModal visible onToken={firstHandler} onCancel={onCancel} />);
  const first = mockWebViews.at(-1)!;
  act(() => {
    first.onMessage!(message({ type: 'token', token: 'first-proof' }));
    first.onMessage!(message({ type: 'token', token: 'duplicate-proof' }));
  });
  expect(firstHandler.mock.calls).toEqual([['first-proof']]);
  act(() => first.onMessage!(message({ type: 'error' })));
  expect(screen.queryByText(/could not load/)).toBeNull();

  const reopen = (): WebViewProps => {
    view.rerender(<NativeModal visible={false} onToken={currentHandler} onCancel={onCancel} />);
    view.rerender(<NativeModal visible onToken={currentHandler} onCancel={onCancel} />);
    return mockWebViews.at(-1)!;
  };
  const second = reopen();
  act(() => first.onMessage!(message({ type: 'token', token: 'old-proof' })));
  expect(firstHandler).toHaveBeenCalledTimes(1);
  expect(currentHandler).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  act(() => second.onMessage!(message({ type: 'token', token: 'cancelled-proof' })));
  expect(currentHandler).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
  const third = reopen();
  act(() => third.onMessage!(message({ type: 'error' })));
  act(() => third.onMessage!(message({ type: 'token', token: 'failed-proof' })));
  expect(currentHandler).not.toHaveBeenCalled();
  const fourth = reopen();
  act(() => {
    fourth.onMessage!({ nativeEvent: { url: 'https://app.onservice.ph', data: 'not-json' } } as WebViewMessageEvent);
    for (const invalid of [null, [], { type: 'unrelated' }, { type: 'token', token: '' }, { type: 'token', token: 42 }]) {
      fourth.onMessage!(message(invalid));
    }
  });
  expect(currentHandler).not.toHaveBeenCalled();
  const latestHandler = jest.fn();
  view.rerender(<NativeModal visible onToken={latestHandler} onCancel={onCancel} />);
  act(() => fourth.onMessage!(message({ type: 'token', token: 'current-proof' })));
  expect(latestHandler.mock.calls).toEqual([['current-proof']]);
  expect(currentHandler).not.toHaveBeenCalled();
  const fifth = reopen();
  view.unmount();
  act(() => fifth.onMessage!(message({ type: 'token', token: 'unmounted-proof' })));
  expect(currentHandler).not.toHaveBeenCalled();
});
