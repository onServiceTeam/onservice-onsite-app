// HA-M2-162 (D38 Milestone 2, package P5a): a screen that starts listening
// before the live connection exists (the usual case at app start) still
// receives events once it connects, and unsubscribing removes only its own
// listener.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => 'access-token' }));

import { connectSocket, subscribeSocketEvent, __resetSocketForTests } from '../src/services/socket.service';

beforeEach(() => {
  __resetSocketForTests();
  mockIo.mockReset();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
});

it('HA-M2-162: a listener registered before the socket exists receives events after connect', () => {
  const early = jest.fn();
  const other = jest.fn();
  const unsubscribeEarly = subscribeSocketEvent('quote:received', early);
  subscribeSocketEvent('quote:received', other);
  expect(mockIo).not.toHaveBeenCalled();

  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();
  const payload = { bookingId: 'booking-1', quoteId: 'quote-1', providerName: 'Ana R.', quotedPrice: 150000 };
  socket.serve('quote:received', payload);

  expect(early).toHaveBeenCalledWith(payload);
  expect(other).toHaveBeenCalledWith(payload);

  unsubscribeEarly();
  socket.serve('quote:received', payload);
  expect(early).toHaveBeenCalledTimes(1);
  expect(other).toHaveBeenCalledTimes(2);
});
