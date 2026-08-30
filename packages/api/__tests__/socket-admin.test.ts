/**
 * Phase 10 — unit tests for the admin socket surface in socket.service.ts.
 *
 * We do NOT spin up a real socket.io Server here. Instead we use the exported
 * `_setIoForTest` helper to inject a tiny fake `io` whose `to(room).emit(...)`
 * call we can spy on. The connection-auth tests cover the JWT verify flow
 * and the admin-room join logic by invoking the registered handlers against
 * fake socket / next callbacks.
 *
 * Mirrors the hermetic mocking pattern of marketing-admin.test.ts:
 *  - logger fully mocked
 *  - messaging.service mocked (we only care about admin paths)
 *  - jsonwebtoken verify mocked (no real JWT signing)
 *  - platform.config mocked to a stable shape
 */

const loggerInfo = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();
const loggerDebug = jest.fn();
const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
  },
}));

jest.mock('../src/services/messaging.service', () => ({
  getConversationById: jest.fn(),
  sendMessage: jest.fn(),
  formatMessage: jest.fn(),
  markMessagesAsRead: jest.fn(),
}));

jest.mock('../src/config/platform.config', () => ({
  platformConfig: {
    socketPingTimeoutMs: 60_000,
    socketPingIntervalMs: 25_000,
  },
}));

const jwtVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: { verify: (...a: unknown[]) => jwtVerify(...a) },
  verify: (...a: unknown[]) => jwtVerify(...a),
}));

// Capture the io.use middleware and io.on('connection') handler when
// initSocketServer constructs a Server, so we can drive them in tests.
let capturedAuthMiddleware:
  | ((socket: Record<string, unknown>, next: (err?: Error) => void) => void | Promise<void>)
  | null = null;
let capturedConnectionHandler:
  | ((socket: Record<string, unknown>) => void)
  | null = null;

jest.mock('socket.io', () => {
  class FakeServer {
    constructor(_http: unknown, _opts: unknown) {
      // no-op
    }
    use(fn: (s: Record<string, unknown>, n: (e?: Error) => void) => void | Promise<void>): this {
      capturedAuthMiddleware = fn;
      return this;
    }
    on(event: string, fn: (s: Record<string, unknown>) => void): this {
      if (event === 'connection') capturedConnectionHandler = fn;
      return this;
    }
    to(_room: string): { emit: jest.Mock } {
      return { emit: jest.fn() };
    }
  }
  return { Server: FakeServer };
});

import * as socketService from '../src/services/socket.service';

interface EmitSpy { event: string; data: unknown }

function makeFakeIo(): { io: { to: jest.Mock }; toCalls: string[]; emits: EmitSpy[] } {
  const toCalls: string[] = [];
  const emits: EmitSpy[] = [];
  const io = {
    to: jest.fn((room: string) => {
      toCalls.push(room);
      return {
        emit: (event: string, data: unknown): void => {
          emits.push({ event, data });
        },
      };
    }),
  };
  return { io, toCalls, emits };
}

beforeEach(() => {
  jest.clearAllMocks();
  dbQuery.mockResolvedValue({
    rows: [{ role: 'admin', is_active: true, session_version: 1 }],
  });
  capturedAuthMiddleware = null;
  capturedConnectionHandler = null;
  socketService._setIoForTest(null);
});

afterAll(() => {
  socketService._setIoForTest(null);
});

describe('ADMIN_EVENTS constant', () => {
  it('exposes the 10 documented event names with stable string values', () => {
    expect(socketService.ADMIN_EVENTS).toEqual({
      BOOKING_CREATED: 'booking:created',
      BOOKING_STATUS_CHANGED: 'booking:status_changed',
      BOOKING_PROVIDER_ASSIGNED: 'booking:provider_assigned',
      BOOKING_GPS_UPDATE: 'booking:gps_update',
      DISPUTE_FILED: 'dispute:filed',
      DISPUTE_UPDATED: 'dispute:updated',
      DISPUTE_RESOLVED: 'dispute:resolved',
      PROVIDER_ONLINE: 'provider:online',
      PROVIDER_OFFLINE: 'provider:offline',
      ALERT_NEW: 'alert:new',
    });
  });

  it('has exactly 10 keys (guards against accidental drift)', () => {
    expect(Object.keys(socketService.ADMIN_EVENTS)).toHaveLength(10);
  });
});

describe('emitAdminEvent', () => {
  it('targets the admin:global room and emits with the supplied payload', () => {
    const fake = makeFakeIo();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketService._setIoForTest(fake.io as any);

    const payload = { id: 'b1', status: 'requested' };
    socketService.emitAdminEvent(socketService.ADMIN_EVENTS.BOOKING_CREATED, payload);

    expect(fake.io.to).toHaveBeenCalledWith('admin:global');
    expect(fake.toCalls).toEqual(['admin:global']);
    expect(fake.emits).toEqual([{ event: 'booking:created', data: payload }]);
  });

  it('is a no-op (does not throw) when io has not been initialized', () => {
    socketService._setIoForTest(null);
    expect(() =>
      socketService.emitAdminEvent(socketService.ADMIN_EVENTS.ALERT_NEW, { msg: 'x' }),
    ).not.toThrow();
  });

  it('forwards arbitrary event names (not just ADMIN_EVENTS values)', () => {
    const fake = makeFakeIo();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketService._setIoForTest(fake.io as any);

    socketService.emitAdminEvent('custom:event', 42);

    expect(fake.emits).toEqual([{ event: 'custom:event', data: 42 }]);
  });
});

describe('initSocketServer — JWT auth middleware', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: 'test-secret' };
    // Boot once to capture the middleware/connection handlers.
    socketService.initSocketServer({} as unknown as import('node:http').Server);
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('rejects connections with no token', async () => {
    const next = jest.fn();
    await capturedAuthMiddleware!({ handshake: { auth: {} } }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0]![0] as Error).message).toBe('Authentication required');
  });

  it('rejects partial pre_auth_2fa tokens', async () => {
    jwtVerify.mockReturnValue({ userId: 'u1', role: 'admin', type: 'pre_auth_2fa' });
    const next = jest.fn();
    await capturedAuthMiddleware!({ handshake: { auth: { token: 'tok' } } }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0]![0] as Error).message).toBe('Invalid token type');
  });

  it('rejects refresh tokens', async () => {
    jwtVerify.mockReturnValue({ userId: 'u1', role: 'admin', type: 'refresh' });
    const next = jest.fn();
    await capturedAuthMiddleware!({ handshake: { auth: { token: 'tok' } } }, next);
    expect((next.mock.calls[0]![0] as Error).message).toBe('Invalid token type');
  });

  it('accepts a valid access token and stamps canonical userId/userRole on the socket', async () => {
    jwtVerify.mockReturnValue({ userId: 'u1', role: 'admin', sessionVersion: 1 });
    const next = jest.fn();
    const socket: Record<string, unknown> = { handshake: { auth: { token: 'tok' } } };
    await capturedAuthMiddleware!(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.userId).toBe('u1');
    expect(socket.userRole).toBe('admin');
  });

  it('rejects when JWT verification throws', async () => {
    jwtVerify.mockImplementation(() => { throw new Error('bad sig'); });
    const next = jest.fn();
    await capturedAuthMiddleware!({ handshake: { auth: { token: 'tok' } } }, next);
    expect((next.mock.calls[0]![0] as Error).message).toBe('Invalid token');
  });
});

describe('initSocketServer — connection handler & admin:global join', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: 'test-secret' };
    socketService.initSocketServer({} as unknown as import('node:http').Server);
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  function fakeSocket(role: string): { join: jest.Mock; on: jest.Mock; userId: string; userRole: string; id: string } {
    return {
      join: jest.fn(),
      on: jest.fn(),
      userId: 'u-' + role,
      userRole: role,
      id: 'sid-' + role,
    };
  }

  it('joins admin role into admin:global', () => {
    const s = fakeSocket('admin');
    capturedConnectionHandler!(s);
    expect(s.join).toHaveBeenCalledWith('user:u-admin');
    expect(s.join).toHaveBeenCalledWith('admin:global');
  });

  it('joins super_admin role into admin:global', () => {
    const s = fakeSocket('super_admin');
    capturedConnectionHandler!(s);
    expect(s.join).toHaveBeenCalledWith('admin:global');
  });

  it('does NOT join admin:global for customer role', () => {
    const s = fakeSocket('customer');
    capturedConnectionHandler!(s);
    const joinedRooms = s.join.mock.calls.map((c) => c[0] as string);
    expect(joinedRooms).toContain('user:u-customer');
    expect(joinedRooms).not.toContain('admin:global');
  });

  it('does NOT join admin:global for provider role', () => {
    const s = fakeSocket('provider');
    capturedConnectionHandler!(s);
    const joinedRooms = s.join.mock.calls.map((c) => c[0] as string);
    expect(joinedRooms).not.toContain('admin:global');
  });
});
