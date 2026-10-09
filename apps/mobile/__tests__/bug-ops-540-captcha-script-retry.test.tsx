import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let TurnstileModal: typeof import('../src/components/TurnstileModal.web').default;

beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  // Load after the build-time public key fixture. The actual web component,
  // loader and DOM script handlers run; only Cloudflare's SDK is simulated.
  TurnstileModal = require('../src/components/TurnstileModal.web').default;
});

afterAll(() => {
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
  document.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]')
    .forEach(script => script.remove());
});

it('Bug OPS-540 — reopening the browser security check recovers after a loaded script has no API', async () => {
  const onToken = jest.fn();
  const onCancel = jest.fn();
  const view = render(<TurnstileModal visible onToken={onToken} onCancel={onCancel} />);
  const first = document.querySelector('script[src*="turnstile/v0/api.js"]');
  expect(first).not.toBeNull();
  // Real script load event, but no SDK global (blocked or incomplete script).
  await act(async () => { first?.dispatchEvent(new Event('load')); });
  expect(screen.getByText('The security check could not load. Check your connection and try again.')).toBeTruthy();
  expect(onToken).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);

  view.rerender(<TurnstileModal visible={false} onToken={onToken} onCancel={onCancel} />);
  view.rerender(<TurnstileModal visible onToken={onToken} onCancel={onCancel} />);
  await waitFor(() => {
    const retry = document.querySelector('script[src*="turnstile/v0/api.js"]');
    expect(retry).not.toBeNull();
    expect(retry).not.toBe(first);
  });
  const second = document.querySelector('script[src*="turnstile/v0/api.js"]');
  expect(first?.isConnected).toBe(false);
  expect(document.querySelectorAll('script[src*="turnstile/v0/api.js"]')).toHaveLength(1);
  // An explicit network failure is also retryable and does not append an
  // unbounded collection of failed script elements on every reopening.
  await act(async () => { second?.dispatchEvent(new Event('error')); });
  expect(screen.getByText('The security check could not load. Check your connection and try again.')).toBeTruthy();
  view.rerender(<TurnstileModal visible={false} onToken={onToken} onCancel={onCancel} />);
  view.rerender(<TurnstileModal visible onToken={onToken} onCancel={onCancel} />);
  const third = document.querySelector('script[src*="turnstile/v0/api.js"]');
  expect(third).not.toBeNull();
  expect(third).not.toBe(second);
  expect(second?.isConnected).toBe(false);

  const sdk = { render: jest.fn().mockReturnValue('synthetic-widget'), remove: jest.fn() };
  window.turnstile = sdk;
  await act(async () => { third?.dispatchEvent(new Event('load')); });
  expect(sdk.render).toHaveBeenCalledTimes(1);
  expect(sdk.render).toHaveBeenCalledWith(screen.getByTestId('turnstile-host'), expect.objectContaining({
    sitekey: 'synthetic-public-site-key', theme: 'light',
  }));
  expect(screen.queryByText('The security check could not load. Check your connection and try again.')).toBeNull();
  const options = sdk.render.mock.calls[0]?.[1] as { callback: (token: string) => void };
  act(() => options.callback('synthetic-proof'));
  expect(onToken).toHaveBeenCalledTimes(1);
  expect(onToken).toHaveBeenCalledWith('synthetic-proof');
  view.unmount();
  expect(sdk.remove).toHaveBeenCalledWith('synthetic-widget');
});
