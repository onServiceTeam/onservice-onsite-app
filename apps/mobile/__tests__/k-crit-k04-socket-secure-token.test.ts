const mockIo = jest.fn();
const mockDisconnect = jest.fn();
const mockSocket = { connected: false, disconnect: mockDisconnect, emit: jest.fn() };
const mockGetAccessToken = jest.fn(() => 'secure-access-token');

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

import { connectSocket, disconnectSocket } from '../src/services/socket.service';

describe('socket authentication', () => {
  it('Bug CRIT-K04 — a new socket connection authenticates with the canonical secure-storage token', () => {
    mockIo.mockReturnValueOnce(mockSocket);
    const result = connectSocket();

    expect(result).toBe(mockSocket);
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: 'secure-access-token' }, transports: ['websocket'] }),
    );

    disconnectSocket();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
