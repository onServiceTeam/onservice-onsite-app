import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setTimeout as delay } from 'node:timers/promises';
import { installNativeHttp, openApiEndpoint, observe } from '../test-support/api-http';

const mockConfig = { apiUrl: '' }, mockPush = jest.fn();
jest.unmock('@/services/api');
jest.unmock('@/stores/auth.store');
jest.mock('@/config/platform.config', () => ({ platformConfig: { get apiUrl() { return mockConfig.apiUrl; } } }));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'synthetic-device-552' }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn() }));
jest.mock('@/stores/provider-application-session.store', () => ({ resetApplicationSession: jest.fn() }));
jest.mock('@/config/demo', () => ({ DEMO_MODE: false }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return { useRouter: () => ({ push: mockPush }), Link: ({ children }: { children: React.ReactNode }) =>
    ReactModule.createElement('a', {}, children) };
});

import api from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { clearTokens, storeTokens } from '@/services/secure-storage';
import Login from '../app/auth/login';

it('Bug OPS-552 — the API deadline covers unfinished response bodies and releases the actual sign-in caller without replay', async () => {
  const restore = installNativeHttp();
  const endpoints: Awaited<ReturnType<typeof openApiEndpoint>>[] = [];
  const pending: Promise<unknown>[] = [];
  let view: ReturnType<typeof render> | undefined;
  try {
    const phases = ['headers', 'json', 'blob', 'blob-error', 'delayed-headers'];
    const observations = phases.map(async phase => {
      const peer = await openApiEndpoint(response => {
        if (phase === 'delayed-headers') {
          const timer = setTimeout(() => { response.writeHead(200); response.write('{'); }, 6_000);
          response.on('close', () => clearTimeout(timer));
        } else if (phase !== 'headers') {
          response.writeHead(phase === 'blob-error' ? 401 : 200);
          response.write('{'); // Headers arrive, but the body never completes.
        }
      });
      endpoints.push(peer);
      const operation = api.post(`${peer.origin}/synthetic-write`, { value: 'fixture' },
        phase.startsWith('blob') ? { responseType: 'blob' } : {});
      pending.push(operation);
      const outcome = await observe(operation);
      for (let attempt = 0; attempt < 100 && peer.closedResponses() === 0; attempt++) await delay(10);
      return { phase, outcome, sends: peer.requests.length, closed: peer.closedResponses() };
    });
    let allowComplete = false;
    const loginPeer = await openApiEndpoint(response => {
      response.writeHead(200);
      response.write('{"success":true,"data":{}');
      if (allowComplete) response.end('}');
    });
    endpoints.push(loginPeer);
    mockConfig.apiUrl = loginPeer.origin;
    useAuthStore.setState({ user: null, isAuthenticated: false, otpRequestId: null });
    view = render(<Login />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mobile Number' }), { target: { value: '9000000552' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));
    expect((screen.getByRole('button', { name: 'Send Verification Code' }) as HTMLButtonElement).disabled).toBe(true);
    // Actual timers and native HTTP, not an accelerated mocked body promise.
    await act(async () => { await delay(18_000); });
    const caller = {
      busy: (screen.getByRole('button', { name: 'Send Verification Code' }) as HTMLButtonElement).disabled,
      errorShown: screen.queryByText(/abort/i) !== null,
      navigations: mockPush.mock.calls.length,
      otpRequestId: useAuthStore.getState().otpRequestId,
      sends: loginPeer.requests.length,
      closed: loginPeer.closedResponses(),
    };
    expect({ transport: await Promise.all(observations), caller }).toEqual({
      transport: phases.map(phase =>
        ({ phase, outcome: 'AbortError', sends: 1, closed: 1 })),
      caller: { busy: false, errorShown: true, navigations: 0, otpRequestId: null, sends: 1, closed: 1 },
    });
    expect(clearTokens).not.toHaveBeenCalled();
    expect(storeTokens).not.toHaveBeenCalled();
    expect(loginPeer.requests[0]).toEqual({ url: '/api/v1/auth/send-otp', method: 'POST',
      body: JSON.stringify({ phone: '+639000000552', deviceFingerprint: 'synthetic-device-552' }) });
    // Only a fresh explicit click sends another request; no retry after timeout.
    allowComplete = true;
    fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(loginPeer.requests).toHaveLength(2);
    expect(useAuthStore.getState().otpRequestId).toBe('+639000000552');
  } finally {
    view?.unmount();
    await Promise.all(endpoints.map(peer => peer.close()));
    await Promise.allSettled(pending);
    restore();
  }
}, 30_000);
