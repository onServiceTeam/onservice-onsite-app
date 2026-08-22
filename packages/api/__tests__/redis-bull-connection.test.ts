import { parseBullConnection } from '../src/config/redis-connection';

describe('parseBullConnection (BullMQ Redis auth)', () => {
  it('carries the password from a redis:// URL (the NOAUTH fix)', () => {
    const c = parseBullConnection('redis://:s3cr3t@redis:6379', {} as NodeJS.ProcessEnv);
    expect(c.host).toBe('redis');
    expect(c.port).toBe(6379);
    expect(c.password).toBe('s3cr3t');
  });

  it('forwards an explicit non-default username but not "default"', () => {
    expect(parseBullConnection('redis://default:pw@h:6379', {} as NodeJS.ProcessEnv).username).toBeUndefined();
    expect(parseBullConnection('redis://alice:pw@h:6379', {} as NodeJS.ProcessEnv).username).toBe('alice');
  });

  it('url-decodes a password with special characters', () => {
    const c = parseBullConnection('redis://:p%40ss%2Fword@h:6380', {} as NodeJS.ProcessEnv);
    expect(c.password).toBe('p@ss/word');
    expect(c.port).toBe(6380);
  });

  it('falls back to REDIS_HOST/PORT/PASSWORD env vars when no URL', () => {
    // Pass '' (not undefined) so the default-param redisUrl is not substituted.
    const c = parseBullConnection('', {
      REDIS_HOST: 'cache',
      REDIS_PORT: '6390',
      REDIS_PASSWORD: 'envpw',
    } as unknown as NodeJS.ProcessEnv);
    expect(c).toEqual({ host: 'cache', port: 6390, password: 'envpw' });
  });

  it('defaults to localhost:6379 with no password when nothing is set', () => {
    const c = parseBullConnection('', {} as NodeJS.ProcessEnv);
    expect(c).toEqual({ host: 'localhost', port: 6379 });
  });

  it('falls through to env on a malformed URL', () => {
    const c = parseBullConnection('not a url', { REDIS_HOST: 'h2', REDIS_PORT: '7000' } as unknown as NodeJS.ProcessEnv);
    expect(c.host).toBe('h2');
    expect(c.port).toBe(7000);
  });
});
