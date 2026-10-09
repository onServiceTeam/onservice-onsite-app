import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockRequestOtp = jest.fn();
jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ requestOtp: mockRequestOtp }) }));
jest.mock('@/components/TurnstileModal', () => jest.requireActual('../src/components/TurnstileModal.web'));

const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
type WidgetOptions = Parameters<NonNullable<typeof window.turnstile>['render']>[1];

beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
});
afterAll(() => {
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
});

it('Bug OPS-542 — a removed browser widget cannot submit its proof for the next phone attempt', async () => {
  const widgets: WidgetOptions[] = [];
  const sdk = {
    render: jest.fn((_host: HTMLElement, options: WidgetOptions) => {
      widgets.push(options);
      return `synthetic-widget-${widgets.length}`;
    }),
    remove: jest.fn(),
  };
  window.turnstile = sdk;
  mockRequestOtp.mockImplementation((_phone: string, proof?: string) => proof
    ? Promise.resolve()
    : Promise.reject(new ApiError(428, null, 'Security check required.')));
  const outcomes: string[] = [];
  function Harness(): React.ReactElement {
    const { requestOtpWithCaptcha, captchaModal } = useCaptchaOtp();
    const start = (phone: string): void => {
      void requestOtpWithCaptcha(phone).then(
        () => { outcomes.push(`sent:${phone}`); },
        () => { outcomes.push(`cancelled:${phone}`); },
      );
    };
    return <>
      <button onClick={() => start('+639000000201')}>First phone</button>
      <button onClick={() => start('+639000000202')}>Second phone</button>
      {captchaModal}
    </>;
  }
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'First phone' }));
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(outcomes).toEqual(['cancelled:+639000000201']));
  expect(sdk.remove).toHaveBeenCalledWith('synthetic-widget-1');

  fireEvent.click(screen.getByRole('button', { name: 'Second phone' }));
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(2));
  // Invoke actual SDK callback closures retained from the removed first widget.
  // The real hook must not send that proof with the newly pending phone number.
  await act(async () => { widgets[0]!.callback('old-synthetic-proof'); });
  expect(mockRequestOtp.mock.calls).toEqual([['+639000000201'], ['+639000000202']]);
  expect(outcomes).toEqual(['cancelled:+639000000201']);
  act(() => { widgets[0]!['error-callback'](); widgets[0]!['expired-callback'](); });
  expect(screen.queryByText('The security check could not load. Check your connection and try again.')).toBeNull();
  expect(screen.getByTestId('turnstile-host')).toBeTruthy();

  await act(async () => { widgets[1]!.callback('current-synthetic-proof'); });
  expect(mockRequestOtp.mock.calls).toEqual([
    ['+639000000201'], ['+639000000202'], ['+639000000202', 'current-synthetic-proof'],
  ]);
  expect(outcomes).toEqual(['cancelled:+639000000201', 'sent:+639000000202']);
  view.unmount();
  await act(async () => { widgets[1]!.callback('late-synthetic-proof'); });
  expect(mockRequestOtp).toHaveBeenCalledTimes(3);
  expect(sdk.remove).toHaveBeenCalledWith('synthetic-widget-2');
});
