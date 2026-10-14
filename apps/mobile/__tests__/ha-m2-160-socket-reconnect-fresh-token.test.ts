// HA-M2-160 (D38 Milestone 2, package P5a): the live connection's handshake
// reads the access token at every connect, so a reconnect after the token
// rotated presents the new token, and the app keeps one socket instead of
// creating a second one.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();
let mockToken = 'access-token-1';

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => mockToken }));

import { connectSocket, __resetSocketForTests } from '../src/services/socket.service';

beforeEach(() => {
  __resetSocketForTests();
  mockIo.mockReset();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
  mockToken = 'access-token-1';
});

it('HA-M2-160: a reconnect after the token rotated sends the fresh token on the same socket', () => {
  const socket = connectSocket() as unknown as FakeSocket;
  expect(socket.handshakeToken()).toBe('access-token-1');
  socket.simulateConnect();

  // The connection drops while the HTTP layer rotates the token.
  socket.serverDisconnect();
  mockToken = 'access-token-2';
  const again = connectSocket() as unknown as FakeSocket;

  expect(again).toBe(socket);
  expect(mockIo).toHaveBeenCalledTimes(1);
  expect(socket.connectCalls).toBe(2);
  expect(socket.handshakeToken()).toBe('access-token-2');
  expect(socket.options.reconnectionAttempts).toBe(Infinity);
});
