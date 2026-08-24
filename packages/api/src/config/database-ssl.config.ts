export type DatabaseSslMode = 'disable' | 'require' | 'verify-full';

export interface DatabaseSslResolution {
  mode: DatabaseSslMode;
  ssl: false | { rejectUnauthorized: boolean };
}

const INTERNAL_DATABASE_HOSTS = new Set(['pgbouncer', 'postgres', 'localhost', '127.0.0.1', '::1']);

function databaseHost(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Resolve the PostgreSQL transport policy without opening a connection.
 *
 * The self-hosted production topology connects API -> PgBouncer over the
 * private Compose network, where PgBouncer does not terminate client TLS.
 * Managed/external databases must use TLS. An explicit production `disable`
 * is therefore accepted only for the known local/Compose hostnames.
 *
 * DB_SSL_REJECT_UNAUTHORIZED remains a compatibility fallback when
 * DB_SSL_MODE is absent. New deployments should use DB_SSL_MODE explicitly.
 */
export function resolveDatabaseSsl(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseSslResolution {
  const configuredMode = env.DB_SSL_MODE?.trim().toLowerCase();

  if (!configuredMode) {
    if (env.NODE_ENV !== 'production') return { mode: 'disable', ssl: false };
    const rejectUnauthorized = env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    return {
      mode: rejectUnauthorized ? 'verify-full' : 'require',
      ssl: { rejectUnauthorized },
    };
  }

  if (!['disable', 'require', 'verify-full'].includes(configuredMode)) {
    throw new Error(
      `FATAL: invalid DB_SSL_MODE "${configuredMode}". Use disable, require, or verify-full.`,
    );
  }

  if (configuredMode === 'disable') {
    const host = databaseHost(env.DATABASE_URL);
    if (env.NODE_ENV === 'production' && (!host || !INTERNAL_DATABASE_HOSTS.has(host))) {
      throw new Error(
        'FATAL: DB_SSL_MODE=disable is allowed in production only for the local self-hosted ' +
          'Postgres/PgBouncer transport. External database hosts must use require or verify-full.',
      );
    }
    return { mode: 'disable', ssl: false };
  }

  if (configuredMode === 'require') {
    return { mode: 'require', ssl: { rejectUnauthorized: false } };
  }

  return { mode: 'verify-full', ssl: { rejectUnauthorized: true } };
}
