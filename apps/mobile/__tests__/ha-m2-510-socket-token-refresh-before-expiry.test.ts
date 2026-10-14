// HA-M2-510 (D38 Milestone 2, package P5a review fix, missing coverage):
// about 90 s before the access token expires, the live connection refreshes
// it through the shared refresh and hands the new token to the server with
// `auth:refresh`, so the connection survives the 15-minute token rotation
// without being cut off. When the server accepts it, the next refresh is
// armed for the new token.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();
const mockRefresh = jest.fn();
let mockToken = '';

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => mockToken }));
jest.mock('../src/services/api', () => ({ refreshAuthSession: () => mockRefresh() }));

import { connectSocket, __resetSocketForTests } from '../src/services/socket.service';

const START_MS = Date.parse('2026-10-14T03:00:00.000Z');

function base64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function token(name: string, iatMs: number, expMs: number): string {
  const claims = { userId: 'u1', name, iat: Math.floor(iatMs / 1000), exp: Math.floor(expMs / 1000) };
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(JSON.stringify(claims))}.sig`;
}

afterEach(() => {
  jest.useRealTimers();
  __resetSocketForTests();
});

it('HA-M2-510: the socket refreshes its token 90 s before expiry, sends it with auth:refresh, and arms the next refresh', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(START_MS);
  __resetSocketForTests();
  // Issued 13 minutes ago; expires in 120 s.
  mockToken = token('first', START_MS - 780_000, START_MS + 120_000);
  const refreshed: string[] = [];
  mockRefresh.mockReset();
  mockRefresh.mockImplementation(async () => {
    mockToken = token(`rotated-${refreshed.length + 1}`, Date.now(), Date.now() + 900_000);
    refreshed.push(mockToken);
    return true;
  });
  mockIo.mockImplementation((url: string, options: object) => {
    const fake = new FakeSocket(url, options);
    const record = fake.emit.bind(fake);
    fake.emit = ((event: string, ...args: unknown[]) => {
      record(event, ...args);
      const ack = args[args.length - 1];
      if (event === 'auth:refresh' && typeof ack === 'function') (ack as (r: { ok: boolean }) => void)({ ok: true });
      return fake;
    }) as FakeSocket['emit'];
    return fake;
  });

  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();

  await jest.advanceTimersByTimeAsync(29_000);
  expect(mockRefresh).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(2_000);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  const sent = socket.emitted.filter((entry) => entry.event === 'auth:refresh');
  expect(sent).toHaveLength(1);
  expect(sent[0]!.args[0]).toBe(refreshed[0]);

  // The new token lives 15 minutes: the next refresh comes 90 s before that.
  await jest.advanceTimersByTimeAsync(805_000);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  expect(socket.emitted.filter((entry) => entry.event === 'auth:refresh').map((entry) => entry.args[0])).toEqual(refreshed);
});
