import React from 'react';
import { act, render, screen } from '@testing-library/react';
import type { WebViewProps } from 'react-native-webview';

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

it('Bug OPS-548 — native page-load failure leaves a visible recoverable error rather than a waiting check', () => {
  const onToken = jest.fn(), onCancel = jest.fn();
  for (const kind of ['network', 'http'] as const) {
    const view = render(<NativeModal visible onToken={onToken} onCancel={onCancel} />);
    const page = mockWebViews.at(-1)!;
    act(() => {
      if (kind === 'network') page.onError?.({ nativeEvent: { description: 'Synthetic offline failure' } } as Parameters<NonNullable<WebViewProps['onError']>>[0]);
      else page.onHttpError?.({ nativeEvent: { statusCode: 503 } } as Parameters<NonNullable<WebViewProps['onHttpError']>>[0]);
    });
    expect(screen.getByText(/could not load/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByTestId('turnstile-webview')).toBeNull();
    expect(view.container.querySelector('rn-activity-indicator')).toBeNull();
    expect(onToken).not.toHaveBeenCalled();
    view.unmount();
  }
});
