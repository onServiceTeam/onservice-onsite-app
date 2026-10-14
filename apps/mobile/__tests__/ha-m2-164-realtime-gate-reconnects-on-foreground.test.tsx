// HA-M2-164 (D38 Milestone 2, package P5a): when the app comes back to the
// foreground, RealtimeGate connects the live connection again (phones drop
// background sockets), so new requests and quotes reach an open app.
import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';

const mockConnect = jest.fn();

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: 'provider-1', role: 'provider' },
  }),
}));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => mockConnect(),
  disconnectSocket: jest.fn(),
  onSocketStatus: () => () => undefined,
}));

import { RealtimeGate } from '@/components/RealtimeGate';

type AppStateMock = typeof AppState & { __emit: (state: string) => void };

it('HA-M2-164: RealtimeGate connects again when the app returns to the foreground', () => {
  render(<QueryClientProvider client={new QueryClient()}><RealtimeGate /></QueryClientProvider>);
  expect(mockConnect).toHaveBeenCalledTimes(1);

  act(() => { (AppState as AppStateMock).__emit('background'); });
  expect(mockConnect).toHaveBeenCalledTimes(1);

  act(() => { (AppState as AppStateMock).__emit('active'); });
  expect(mockConnect).toHaveBeenCalledTimes(2);
});
