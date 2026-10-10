import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockRequestOtp = jest.fn(), mockPush = jest.fn();
jest.mock('@/stores/auth.store', () => {
  const state = { requestOtp: mockRequestOtp, sessionExpired: false };
  return { useAuthStore: (selector?: (value: typeof state) => unknown) => selector ? selector(state) : state };
});
jest.mock('@/components/TurnstileModal', () => jest.requireActual('../src/components/TurnstileModal.web'));
jest.mock('@/config/demo', () => ({ DEMO_MODE: false }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => ({ push: mockPush }),
    Link: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('a', {}, children),
  };
});
const priorSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let Login: typeof import('../app/auth/login').default;
let useCaptchaOtp: typeof import('../src/hooks/useCaptchaOtp').useCaptchaOtp;
type WidgetOptions = Parameters<NonNullable<typeof window.turnstile>['render']>[1];
beforeAll(() => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-public-site-key';
  useCaptchaOtp = require('../src/hooks/useCaptchaOtp').useCaptchaOtp;
  Login = require('../app/auth/login').default;
});
afterAll(() => {
  if (priorSiteKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = priorSiteKey;
  delete window.turnstile;
});

it('Bug OPS-545 — leaving sign-in settles its pending work and prevents late navigation or proof dispatch', async () => {
  let complete!: () => void;
  mockRequestOtp.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  const login = render(<Login />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Mobile Number' }), { target: { value: '9000000301' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));
  expect(mockRequestOtp).toHaveBeenCalledTimes(1);
  login.unmount();
  await act(async () => complete());
  expect(mockPush).not.toHaveBeenCalled();

  const widgets: WidgetOptions[] = [];
  window.turnstile = {
    render: (_host, options) => { widgets.push(options); return `widget-${widgets.length}`; },
    remove: jest.fn(),
  };
  let request!: ReturnType<typeof useCaptchaOtp>['requestOtpWithCaptcha'];
  function Harness(): React.ReactElement {
    const hook = useCaptchaOtp();
    request = hook.requestOtpWithCaptcha;
    return hook.captchaModal;
  }
  // All three awaiting stages settle on unmount, not only an already-open widget.
  for (const stage of ['initial', 'challenge', 'proof', 'proof-before-dispatch'] as const) {
    mockRequestOtp.mockReset();
    const outcomes: unknown[] = [];
    let rejectInitial!: (reason: Error) => void;
    let completeProof!: () => void;
    mockRequestOtp.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectInitial = reject; }));
    const view = render(<React.StrictMode><Harness /></React.StrictMode>);
    await act(async () => {
      void request('+639000000302').then(() => { outcomes.push('accepted'); }, error => { outcomes.push(error); });
    });
    if (stage !== 'initial') {
      await act(async () => rejectInitial(new ApiError(428, null, 'Security check required.')));
      await waitFor(() => expect(screen.getByTestId('turnstile-host')).toBeTruthy());
    }
    if (stage === 'proof') {
      mockRequestOtp.mockImplementationOnce(() => new Promise<void>(resolve => { completeProof = resolve; }));
      await act(async () => widgets.at(-1)!.callback('current-proof'));
      expect(mockRequestOtp).toHaveBeenCalledTimes(2);
    }
    if (stage === 'proof-before-dispatch') {
      // Cleanup runs before the resolved proof's await continuation.
      act(() => { widgets.at(-1)!.callback('cancelled-before-dispatch'); view.unmount(); });
    } else view.unmount();
    await act(async () => {});
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toBeInstanceOf(Error);
    if (stage === 'initial') {
      await act(async () => rejectInitial(new ApiError(428, null, 'Late security check required.')));
    } else if (stage === 'proof') {
      await act(async () => completeProof());
    } else {
      await act(async () => widgets.at(-1)!.callback('late-proof'));
    }
    expect(outcomes).toHaveLength(1);
    expect(mockRequestOtp).toHaveBeenCalledTimes(stage === 'proof' ? 2 : 1);
    await act(async () => {
      await expect(request('+639000000303')).rejects.toThrow();
    });
    expect(mockRequestOtp).toHaveBeenCalledTimes(stage === 'proof' ? 2 : 1);
  }
});
