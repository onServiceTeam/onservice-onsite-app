import React from 'react';
import { act, render, screen } from '@testing-library/react';

const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let TurnstileModal: typeof import('../src/components/TurnstileModal.web').default;

beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  TurnstileModal = require('../src/components/TurnstileModal.web').default;
});

afterAll(() => {
  jest.useRealTimers();
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
  document.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]')
    .forEach(script => script.remove());
});

it('Bug OPS-541 — a stalled browser security script ends visibly and cannot poison the next explicit attempt', async () => {
  // React's act uses microtasks for settling render work. Leave those real;
  // the timer count below then measures the loader's timeout, not act's queue.
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const onToken = jest.fn();
  const onCancel = jest.fn();
  const view = render(<TurnstileModal visible onToken={onToken} onCancel={onCancel} />);
  const first = document.querySelector('script[src*="turnstile/v0/api.js"]');
  expect(first).not.toBeNull();
  // No script event arrives. Advance the actual loader's deadline, not a
  // simulated rejected provider promise or a test-only production timeout.
  await act(async () => { jest.advanceTimersByTime(14_999); });
  expect(screen.queryByText('The security check could not load. Check your connection and try again.')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(screen.getByText('The security check could not load. Check your connection and try again.')).toBeTruthy();
  expect(first?.isConnected).toBe(false);
  expect(onToken).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);

  view.rerender(<TurnstileModal visible={false} onToken={onToken} onCancel={onCancel} />);
  view.rerender(<TurnstileModal visible onToken={onToken} onCancel={onCancel} />);
  const retry = document.querySelector('script[src*="turnstile/v0/api.js"]');
  expect(retry).not.toBeNull();
  expect(retry).not.toBe(first);
  const sdk = { render: jest.fn().mockReturnValue('synthetic-widget'), remove: jest.fn() };
  window.turnstile = sdk;
  await act(async () => { first?.dispatchEvent(new Event('load')); });
  expect(sdk.render).not.toHaveBeenCalled();
  await act(async () => { retry?.dispatchEvent(new Event('load')); });
  expect(sdk.render).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  // Success clears the load deadline. It does not impose a timer on the human
  // solving the actual widget or automatically submit/retry a phone request.
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(screen.getByTestId('turnstile-host')).toBeTruthy();
  expect(screen.queryByText('The security check could not load. Check your connection and try again.')).toBeNull();
  expect(onToken).not.toHaveBeenCalled();
  view.unmount();
  expect(sdk.remove).toHaveBeenCalledWith('synthetic-widget');
});
