/**
 * Pure Redis/BullMQ connection parsing.
 *
 * Keep this module free of client construction so configuration behavior can
 * be tested without opening a Redis socket or leaving retry timers behind.
 */
export interface BullConnection {
  host: string;
  port: number;
  password?: string;
  username?: string;
}

export function parseBullConnection(
  url: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): BullConnection {
  if (url) {
    try {
      const parsed = new URL(url);
      const connection: BullConnection = {
        host: parsed.hostname || 'localhost',
        port: parsed.port ? Number(parsed.port) : 6379,
      };
      if (parsed.password) connection.password = decodeURIComponent(parsed.password);
      // Redis `requirepass` uses the implicit "default" user. Forward only a
      // non-default ACL username so password-only deployments keep working.
      if (parsed.username && parsed.username !== 'default') {
        connection.username = decodeURIComponent(parsed.username);
      }
      return connection;
    } catch {
      // Malformed URL: fall through to explicit host/port environment values.
    }
  }

  const connection: BullConnection = {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
  };
  if (env.REDIS_PASSWORD) connection.password = env.REDIS_PASSWORD;
  return connection;
}
