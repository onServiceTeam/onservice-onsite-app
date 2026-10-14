// HA-M2-511 (D38 Milestone 2, package P5a review fix, missing coverage): when
// the server refuses the socket handshake because the token is stale
// ("Invalid token"), Socket.IO stops retrying by itself; the app refreshes
// the token once and connects again with the fresh one. A revoked session
// ("Session revoked") is not retried: a fresh token cannot fix it.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();
const mockRefresh = jest.fn();
let mockToken = 'stale-access-token';

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => mockToken }));
jest.mock('../src/services/api', () => ({ refreshAuthSession: () => mockRefresh() }));

import { connectSocket, disconnectSocket, __resetSocketForTests } from '../src/services/socket.service';

beforeEach(() => {
  __resetSocketForTests();
  mockToken = 'stale-access-token';
  mockIo.mockReset();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
  mockRefresh.mockReset();
  mockRefresh.mockImplementation(async () => { mockToken = 'fresh-access-token'; return true; });
});

it('HA-M2-511: a handshake refused for a stale token refreshes once and reconnects; a revoked session does not retry', async () => {
  const socket = connectSocket() as unknown as FakeSocket;
  expect(socket.connectCalls).toBe(1);

  socket.refuseHandshake('Invalid token');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(socket.connectCalls).toBe(2);
  expect(socket.handshakeToken()).toBe('fresh-access-token');

  // A new sign-in later; this time the server says the session was revoked.
  disconnectSocket();
  mockRefresh.mockClear();
  const again = connectSocket() as unknown as FakeSocket;
  const callsBefore = again.connectCalls;
  again.refuseHandshake('Session revoked');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(again.connectCalls).toBe(callsBefore);
});
