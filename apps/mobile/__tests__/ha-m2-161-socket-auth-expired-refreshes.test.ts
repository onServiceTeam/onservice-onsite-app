// HA-M2-161 (D38 Milestone 2, package P5a): when the server says the
// socket's token expired (`auth:expired`, then it disconnects), the app
// refreshes the token once through the shared single-flight refresh and
// connects again, rejoining the conversation it had open.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();
const mockRefresh = jest.fn();
let mockToken = 'expired-access-token';

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => mockToken }));
jest.mock('../src/services/api', () => ({ refreshAuthSession: () => mockRefresh() }));

import { connectSocket, joinConversation, __resetSocketForTests } from '../src/services/socket.service';

beforeEach(() => {
  __resetSocketForTests();
  mockIo.mockReset();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
  mockRefresh.mockReset();
  mockRefresh.mockImplementation(async () => { mockToken = 'refreshed-access-token'; return true; });
});

it('HA-M2-161: auth:expired refreshes the token once and reconnects with it, rejoining the open thread', async () => {
  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();
  joinConversation('conversation-1');
  socket.emitted.length = 0;

  // The server is ending this session; auth:expired arrives first.
  socket.connected = false;
  socket.active = false;
  socket.serve('auth:expired', { reason: 'token_expired' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(socket.connectCalls).toBe(2);
  expect(socket.handshakeToken()).toBe('refreshed-access-token');

  socket.simulateConnect();
  expect(socket.emitted).toContainEqual({ event: 'join:conversation', args: ['conversation-1'] });
});
