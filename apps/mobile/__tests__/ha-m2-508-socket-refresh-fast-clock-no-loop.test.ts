// HA-M2-508 (D38 Milestone 2, package P5a review fix): a phone whose clock
// runs 20 minutes fast does not loop token refreshes. The live connection
// refreshes its token about 90 s before expiry; before, the delay used the
// phone's clock alone, so on a fast clock every refresh armed the next one
// at once: about 60 token rotations a minute against the API's limit of 100
// requests per user per 15 minutes. Now the delay is measured in server time
// (learned from the fresh token), capped by the token's own lifetime and
// never shorter than a minute.
import { FakeSocket } from '../test-support/fake-socket';

const mockIo = jest.fn();
const mockRefresh = jest.fn();
let mockToken = '';

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/services/secure-storage', () => ({ getAccessToken: () => mockToken }));
jest.mock('../src/services/api', () => ({ refreshAuthSession: () => mockRefresh() }));

import { connectSocket, __resetSocketForTests } from '../src/services/socket.service';

const SERVER_START_MS = Date.parse('2026-10-14T02:00:00.000Z');
const CLOCK_AHEAD_MS = 20 * 60 * 1000;
const TOKEN_LIFETIME_S = 15 * 60;

function base64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An access token the server issued at serverMs (only exp and iat matter here). */
function tokenIssuedAt(serverMs: number): string {
  const iat = Math.floor(serverMs / 1000);
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(JSON.stringify({ userId: 'u1', iat, exp: iat + TOKEN_LIFETIME_S }))}.sig`;
}

afterEach(() => {
  jest.useRealTimers();
  __resetSocketForTests();
});

it('HA-M2-508: with the phone clock 20 minutes fast, the socket refreshes once per token lifetime, not in a loop', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(SERVER_START_MS + CLOCK_AHEAD_MS);
  __resetSocketForTests();
  mockToken = tokenIssuedAt(SERVER_START_MS);
  mockRefresh.mockReset();
  mockRefresh.mockImplementation(async () => {
    // The server issues the new token in its own (correct) time.
    mockToken = tokenIssuedAt(Date.now() - CLOCK_AHEAD_MS);
    return true;
  });
  mockIo.mockImplementation((url: string, options: object) => {
    const fake = new FakeSocket(url, options);
    const record = fake.emit.bind(fake);
    // The server accepts every auth:refresh.
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

  // Ten minutes on a phone whose clock is 20 minutes fast.
  for (let second = 0; second < 600; second += 10) {
    await jest.advanceTimersByTimeAsync(10_000);
  }

  // The token the phone started with looked expired on its own clock, so it
  // refreshed once (after the one-minute floor) and then waited for the new
  // token's real lifetime.
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(socket.emitted.filter((entry) => entry.event === 'auth:refresh')).toHaveLength(1);
});
