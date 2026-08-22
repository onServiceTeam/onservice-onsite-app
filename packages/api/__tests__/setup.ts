/**
 * Shared API unit-test boundaries.
 *
 * The API database and Redis modules construct production clients at import
 * time. Unit suites exercise services with mocked network edges, so opening
 * real clients in every Jest sandbox is unnecessary and harmful: their socket
 * and retry handles kept CI alive until its 15-minute timeout. Suites that need
 * specific behavior can override these methods in their own jest.mock factory.
 */
const unexpectedDatabaseAccess = () =>
  Promise.reject(new Error('Unit test attempted an unmocked PostgreSQL operation'));

jest.mock('../src/config/database.config', () => ({
  pool: {
    on: jest.fn(),
    query: jest.fn().mockImplementation(unexpectedDatabaseAccess),
    connect: jest.fn().mockImplementation(unexpectedDatabaseAccess),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/config/redis.config', () => ({
  redis: {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(0),
    keys: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn().mockImplementation(async (...command: unknown[]) => {
      const operation = String(command[0] ?? '').toUpperCase();
      const subcommand = String(command[1] ?? '').toUpperCase();

      if (operation === 'SCRIPT' && subcommand === 'LOAD') {
        return 'unit-test-script-sha';
      }

      if (operation === 'EVALSHA') {
        return [1, 60_000];
      }

      return null;
    }),
  },
  bullMqConnection: { host: '127.0.0.1', port: 6379 },
}));
