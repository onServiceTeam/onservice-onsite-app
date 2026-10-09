import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let TurnstileModal: typeof import('../src/components/TurnstileModal.web').default;
type WidgetOptions = Parameters<NonNullable<typeof window.turnstile>['render']>[1];
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  TurnstileModal = require('../src/components/TurnstileModal.web').default;
});
afterAll(() => {
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
});

it('Bug OPS-543 — each browser widget settles once and cannot accept a proof after error or expiry', async () => {
  const widgets: WidgetOptions[] = [];
  const sdk = {
    render: jest.fn((_host: HTMLElement, options: WidgetOptions) => {
      widgets.push(options);
      return `synthetic-widget-${widgets.length}`;
    }),
    remove: jest.fn(),
  };
  window.turnstile = sdk;
  const firstHandler = jest.fn(), latestHandler = jest.fn(), onCancel = jest.fn();
  const view = render(<TurnstileModal visible onToken={firstHandler} onCancel={onCancel} />);
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(1));
  // A callback-prop refresh in the SAME visible attempt must remain usable
  // without resetting the human's widget or keeping a stale parent callback.
  view.rerender(<TurnstileModal visible onToken={latestHandler} onCancel={onCancel} />);
  act(() => { widgets[0]!.callback('first-proof'); widgets[0]!.callback('duplicate-proof'); });
  expect(firstHandler).not.toHaveBeenCalled();
  expect(latestHandler.mock.calls).toEqual([['first-proof']]);
  act(() => { widgets[0]!['error-callback'](); widgets[0]!['expired-callback'](); });
  expect(screen.queryByText('The security check could not load. Check your connection and try again.')).toBeNull();

  for (const failure of ['error-callback', 'expired-callback'] as const) {
    view.rerender(<TurnstileModal visible={false} onToken={latestHandler} onCancel={onCancel} />);
    view.rerender(<TurnstileModal visible onToken={latestHandler} onCancel={onCancel} />);
    await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(failure === 'error-callback' ? 2 : 3));
    const widget = widgets.at(-1)!;
    act(() => widget[failure]());
    expect(screen.getByText('The security check could not load. Check your connection and try again.')).toBeTruthy();
    act(() => widget.callback('invalidated-proof'));
    expect(latestHandler.mock.calls).toEqual([['first-proof']]);
  }
  // A provider render exception must also invalidate callbacks it retained
  // before throwing. No widget ID was returned, so there is none to remove.
  view.rerender(<TurnstileModal visible={false} onToken={latestHandler} onCancel={onCancel} />);
  sdk.render.mockImplementationOnce((_host, options) => {
    widgets.push(options);
    throw new Error('synthetic SDK render failure');
  });
  view.rerender(<TurnstileModal visible onToken={latestHandler} onCancel={onCancel} />);
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(4));
  expect(screen.getByText('The security check could not load. Check your connection and try again.')).toBeTruthy();
  act(() => widgets.at(-1)!.callback('render-failed-proof'));
  expect(latestHandler).toHaveBeenCalledTimes(1);
  view.unmount();
  act(() => widgets.at(-1)!.callback('unmounted-proof'));
  expect(latestHandler).toHaveBeenCalledTimes(1);
  expect(sdk.remove.mock.calls).toEqual([
    ['synthetic-widget-1'], ['synthetic-widget-2'], ['synthetic-widget-3'],
  ]);
});
