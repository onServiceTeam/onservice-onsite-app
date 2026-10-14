const mockIo = jest.fn();
const mockDisconnect = jest.fn();
const mockSocket = {
  connected: false, active: false, disconnect: mockDisconnect, emit: jest.fn(), on: jest.fn(), off: jest.fn(),
  connect: jest.fn(),
};
const mockGetAccessToken = jest.fn(() => 'secure-access-token');

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

import { connectSocket, disconnectSocket } from '../src/services/socket.service';

// D38 Milestone 2: the handshake reads the token through a callback at every
// connect and reconnect (so a reconnect after rotation sends the new token).
// The callback must still read the canonical secure-storage token.
describe('socket authentication', () => {
  it('Bug CRIT-K04 — a new socket connection authenticates with the canonical secure-storage token', () => {
    mockIo.mockReturnValueOnce(mockSocket);
    const result = connectSocket();

    expect(result).toBe(mockSocket);
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: expect.any(Function), transports: ['websocket'] }),
    );
    const auth = (mockIo.mock.calls[0]![1] as { auth: (cb: (data: { token?: string }) => void) => void }).auth;
    let sent: string | undefined;
    auth((data) => { sent = data.token; });
    expect(sent).toBe('secure-access-token');
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

    disconnectSocket();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
