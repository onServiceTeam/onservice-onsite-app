// HA-M2-163 (D38 Milestone 2, package P5a): RealtimeGate opens the live
// connection while someone is signed in and closes it when they sign out.
// Before D38, signing out never closed the socket.
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockAuth: { isAuthenticated: boolean; user: { id: string; role: string } | null } = {
  isAuthenticated: true,
  user: { id: 'customer-1', role: 'customer' },
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuth) => unknown) => selector(mockAuth),
}));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => mockConnect(),
  disconnectSocket: () => mockDisconnect(),
  onSocketStatus: () => () => undefined,
}));

import { RealtimeGate } from '@/components/RealtimeGate';

it('HA-M2-163: RealtimeGate connects while signed in and disconnects on logout', () => {
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><RealtimeGate /></QueryClientProvider>);
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(mockDisconnect).not.toHaveBeenCalled();

  mockAuth.isAuthenticated = false;
  mockAuth.user = null;
  view.rerender(<QueryClientProvider client={client}><RealtimeGate /></QueryClientProvider>);

  expect(mockDisconnect).toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledTimes(1);
});
